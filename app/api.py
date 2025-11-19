from flask import Blueprint, request, jsonify, abort, session
from app.models import db, Libro, Prestamo, Devolucion, Usuario, Rol, Loggeo
from datetime import datetime
from sqlalchemy.exc import IntegrityError
import traceback
import os

# Log which file was loaded and its modification time to help debugging which copy is running
try:
    _api_path = os.path.abspath(__file__)
    _api_mtime = os.path.getmtime(_api_path)
    print(f"[API-LOADED] file={_api_path} mtime={_api_mtime}")
except Exception:
    print("[API-LOADED] api module loaded (could not stat file)")

api = Blueprint('api', __name__, url_prefix='/api')


def _require_roles(*roles):
    """Return a tuple (allowed, response) or abort with 403.

    Used to protect endpoints based on session keys set by the UI login.
    """
    user_role = session.get('user_role')
    is_auth = session.get('is_authenticated', False)
    if not is_auth or user_role not in roles:
        # Caller will return appropriate 403 JSON response
        return False
    return True


def _obj_or_404(model, obj_id):
    obj = model.query.get(obj_id)
    if not obj:
        abort(404, description=f'{model.__name__} not found')
    return obj


# ---------- Libros ----------
@api.route('/libros', methods=['GET'])
def list_libros():
    libros = Libro.query.order_by(Libro.fechaRegistro.desc()).all()
    return jsonify([l.to_dict() for l in libros])


@api.route('/libros/<int:id>', methods=['GET'])
def get_libro(id):
    l = _obj_or_404(Libro, id)
    return jsonify(l.to_dict())


@api.route('/libros', methods=['POST'])
def create_libro():
    data = request.get_json() or {}
    # Only Administrador may create libros
    if not _require_roles('Administrador'):
        return jsonify({'error': 'forbidden'}), 403
    # basic validation to surface clearer errors
    if not data.get('titulo'):
        abort(400, description='titulo is required')
    if not (data.get('autor') or data.get('autores')):
        abort(400, description='autor or autores is required')
    if not data.get('ISBN'):
        abort(400, description='ISBN is required')

    # sanitize/coerce numeric fields to avoid TypeErrors when DBAPI binds params
    try:
        if 'anioPublicacion' in data and data.get('anioPublicacion') is not None:
            data['anioPublicacion'] = int(data['anioPublicacion'])
        else:
            # default to a sensible year if missing
            data.setdefault('anioPublicacion', None)
        if 'numeroLibros' in data and data.get('numeroLibros') is not None:
            data['numeroLibros'] = int(data['numeroLibros'])
        else:
            data.setdefault('numeroLibros', 1)
        if 'cantidadDisponible' in data and data.get('cantidadDisponible') is not None:
            data['cantidadDisponible'] = int(data['cantidadDisponible'])
        else:
            data.setdefault('cantidadDisponible', data.get('numeroLibros', 0))
        if 'cantidadPrestada' in data and data.get('cantidadPrestada') is not None:
            data['cantidadPrestada'] = int(data['cantidadPrestada'])
        else:
            data.setdefault('cantidadPrestada', 0)
    except (ValueError, TypeError) as e:
        abort(400, description=f'invalid numeric field: {e}')

    # Pre-check duplicate by ISBN to avoid insert attempts that will fail when
    # the table has triggers that prevent SQLAlchemy from obtaining lastrowid.
    isbn_val = data.get('ISBN')
    if isbn_val:
        existing_book = Libro.query.filter_by(ISBN=isbn_val).first()
        if existing_book:
            return jsonify(existing_book.to_dict()), 200

    l = Libro.from_dict(data)
    db.session.add(l)
    try:
        db.session.commit()
        return jsonify(l.to_dict()), 201
    except IntegrityError as e:
        db.session.rollback()
        # If it's a duplicate ISBN, return the existing resource instead of failing
        msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if 'duplicate' in msg.lower() or 'unique' in msg.lower() or 'uq__libros' in msg.lower():
            existing = Libro.query.filter_by(ISBN=data.get('ISBN')).first()
            if existing:
                return jsonify(existing.to_dict()), 200
        return jsonify({'error': 'database integrity error', 'detail': msg}), 400
    except Exception as e:
        # Fallback for SQL Server + triggers where SQLAlchemy/pyodbc cannot obtain lastrowid
        # Strategy:
        # 1) rollback session
        # 2) if a row with same ISBN exists, return it
        # 3) otherwise perform a raw INSERT (no OUTPUT/SCOPE_IDENTITY reliance)
        #    and then SELECT the row by ISBN to obtain its id
        db.session.rollback()
        import traceback as _tb
        tb = _tb.format_exc()
        msg = str(e)

        # quick check: if duplicate exists, return it
        try:
            existing = None
            if data.get('ISBN'):
                existing = Libro.query.filter_by(ISBN=data.get('ISBN')).first()
            print(f"[API-FALLBACK] quick-check existing ISBN={data.get('ISBN')} found={'yes' if existing else 'no'}")
            if existing:
                return jsonify(existing.to_dict()), 200
        except Exception:
            # ignore and continue to fallback insert
            pass

        # Raw-insert fallback: avoid relying on SCOPE_IDENTITY/lastrowid which may be None
        from sqlalchemy import text
        try:
            engine = db.session.get_bind()
            insert_sql = text(
                "INSERT INTO libros (titulo, autor, [ISBN], editorial, [anioPublicacion], categoria, [numeroLibros], idioma, descripcion, estado, [cantidadDisponible], [cantidadPrestada], [fechaRegistro], [ultimaActualizacion]) "
                "VALUES (:titulo, :autor, :ISBN, :editorial, :anioPublicacion, :categoria, :numeroLibros, :idioma, :descripcion, :estado, :cantidadDisponible, :cantidadPrestada, :fechaRegistro, :ultimaActualizacion);"
            )
            params = {
                'titulo': data.get('titulo'),
                'autor': data.get('autor') or (data.get('autores') and ', '.join(data.get('autores'))),
                'ISBN': data.get('ISBN'),
                'editorial': data.get('editorial'),
                'anioPublicacion': data.get('anioPublicacion'),
                'categoria': data.get('categoria'),
                'numeroLibros': data.get('numeroLibros'),
                'idioma': data.get('idioma'),
                'descripcion': data.get('descripcion'),
                'estado': data.get('estado'),
                'cantidadDisponible': data.get('cantidadDisponible'),
                'cantidadPrestada': data.get('cantidadPrestada'),
                'fechaRegistro': data.get('fechaRegistro'),
                'ultimaActualizacion': data.get('ultimaActualizacion')
            }

            with engine.begin() as conn:
                print(f"[API-FALLBACK] performing raw INSERT ISBN={data.get('ISBN')} titulo={data.get('titulo')}")
                conn.execute(insert_sql, params)
                # After raw insert, don't rely on SCOPE_IDENTITY(); instead SELECT by the unique key (ISBN)
                if data.get('ISBN'):
                    row = conn.execute(text("SELECT idLibro FROM libros WHERE [ISBN] = :isbn"), {'isbn': data.get('ISBN')}).fetchone()
                else:
                    row = None

                print(f"[API-FALLBACK] select by ISBN result: {row}")

            if row and row[0] is not None:
                new_id = int(row[0])
                # load the newly created object and return it
                new_obj = Libro.query.get(new_id)
                if new_obj:
                    return jsonify(new_obj.to_dict()), 201

            # If we reach here, fallback did not find a row by ISBN.
            return jsonify({'error': 'fallback failed', 'original': msg, 'trace': tb}), 500
        except Exception as e2:
            db.session.rollback()
            tb2 = _tb.format_exc()
            print(f"[API-FALLBACK][ERROR] fallback exception for ISBN={data.get('ISBN')}: {e2}\n{tb2}")
            # if fallback failed due to duplicate, return existing
            try:
                existing = Libro.query.filter_by(ISBN=data.get('ISBN')).first()
                if existing:
                    return jsonify(existing.to_dict()), 200
            except Exception:
                pass
            return jsonify({'error': 'fallback failed', 'original': msg, 'trace': tb2}), 500


@api.route('/libros/<int:id>', methods=['PUT'])
def update_libro(id):
    l = _obj_or_404(Libro, id)
    # Only Administrador may update libros
    if not _require_roles('Administrador'):
        return jsonify({'error': 'forbidden'}), 403
    data = request.get_json() or {}
    # coerce numeric updates
    try:
        if 'anioPublicacion' in data and data.get('anioPublicacion') is not None:
            data['anioPublicacion'] = int(data['anioPublicacion'])
        if 'numeroLibros' in data and data.get('numeroLibros') is not None:
            data['numeroLibros'] = int(data['numeroLibros'])
        if 'cantidadDisponible' in data and data.get('cantidadDisponible') is not None:
            data['cantidadDisponible'] = int(data['cantidadDisponible'])
        if 'cantidadPrestada' in data and data.get('cantidadPrestada') is not None:
            data['cantidadPrestada'] = int(data['cantidadPrestada'])
    except (ValueError, TypeError) as e:
        abort(400, description=f'invalid numeric field: {e}')
    # If the total number of copies (numeroLibros) is changed but the caller
    # did not explicitly provide cantidadDisponible, reconcile availability
    # so the stored counts remain consistent. Strategy:
    # - If numeroLibros is provided and cantidadDisponible is not, compute
    #   cantidadDisponible = max(0, numeroLibros - cantidadPrestada)
    # - If cantidadPrestada is also provided by the caller, use the provided
    #   cantidadPrestada when computing available copies.
    try:
        if 'numeroLibros' in data and 'cantidadDisponible' not in data:
            new_total = data.get('numeroLibros')
            # prefer provided cantidadPrestada if present, otherwise use the
            # current value from the DB object
            prestadas = data.get('cantidadPrestada') if 'cantidadPrestada' in data else getattr(l, 'cantidadPrestada', 0) or 0
            try:
                prestadas = int(prestadas)
            except Exception:
                prestadas = 0
            try:
                new_total = int(new_total)
            except Exception:
                # if coercion failed, fall back to current total
                new_total = getattr(l, 'numeroLibros', 0) or 0
            # computed available copies cannot be negative
            computed_available = max(0, new_total - prestadas)
            data['cantidadDisponible'] = int(computed_available)
    except Exception:
        # don't let reconciliation errors block the update; proceed and let
        # validation catch issues downstream
        pass

    l.update_from_dict(data)
    try:
        db.session.commit()
        return jsonify(l.to_dict())
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'error': 'database integrity error', 'detail': str(e.orig)}), 400
    except Exception as e:
        db.session.rollback()
        import traceback as _tb
        tb = _tb.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/libros/<int:id>', methods=['DELETE'])
def delete_libro(id):
    # Only Administrador may delete libros
    if not _require_roles('Administrador'):
        return jsonify({'error': 'forbidden'}), 403
    l = _obj_or_404(Libro, id)
    db.session.delete(l)
    db.session.commit()
    return jsonify({'deleted': True})


# ---------- Prestamos ----------
@api.route('/prestamos', methods=['GET'])
def list_prestamos():
    # Defensive: avoid ORM selecting model columns that may not exist in DB yet.
    # Use a raw SELECT of known, existing columns so the endpoint works until the DB schema is migrated.
    try:
        from sqlalchemy import text
        # include id_libro and cantidad so clients receive accurate values
        stmt = text("SELECT id_prestamo, id_usuario, id_libro, cantidad, solicitante, elemento_prestado, tipo, fecha_prestamo, fecha_devolucion, estado FROM prestamos ORDER BY fecha_prestamo DESC")
        res = db.session.execute(stmt)
        rows = res.fetchall()
        out = []
        for r in rows:
            # r keys may be positional; access by name if available
            row = dict(r._mapping) if hasattr(r, '_mapping') else dict(zip(r.keys(), r))
            out.append({
                'id': row.get('id_prestamo'),
                'id_usuario': row.get('id_usuario'),
                'id_libro': row.get('id_libro'),
                'cantidad': int(row.get('cantidad')) if row.get('cantidad') is not None else 1,
                'solicitante': row.get('solicitante'),
                'elemento_prestado': row.get('elemento_prestado'),
                'tipo': row.get('tipo'),
                'fecha_prestamo': (row.get('fecha_prestamo').isoformat() if row.get('fecha_prestamo') is not None else None),
                'fecha_devolucion': (row.get('fecha_devolucion').isoformat() if row.get('fecha_devolucion') is not None else None),
                'estado': row.get('estado')
            })
        return jsonify(out)
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/prestamos/<int:id>', methods=['GET'])
def get_prestamo(id):
    # Defensive select: only query known columns to avoid schema mismatch errors.
    try:
        from sqlalchemy import text
        # include id_libro and cantidad so clients can view accurate values
        stmt = text("SELECT id_prestamo, id_usuario, id_libro, cantidad, solicitante, elemento_prestado, tipo, fecha_prestamo, fecha_devolucion, estado FROM prestamos WHERE id_prestamo = :id")
        res = db.session.execute(stmt, {'id': id})
        row = res.fetchone()
        if not row:
            abort(404, description='Prestamo not found')
        rowm = dict(row._mapping) if hasattr(row, '_mapping') else dict(zip(row.keys(), row))
        return jsonify({
            'id': rowm.get('id_prestamo'),
            'id_usuario': rowm.get('id_usuario'),
            'id_libro': rowm.get('id_libro'),
            'cantidad': int(rowm.get('cantidad')) if rowm.get('cantidad') is not None else 1,
            'solicitante': rowm.get('solicitante'),
            'elemento_prestado': rowm.get('elemento_prestado'),
            'tipo': rowm.get('tipo'),
            'fecha_prestamo': (rowm.get('fecha_prestamo').isoformat() if rowm.get('fecha_prestamo') is not None else None),
            'fecha_devolucion': (rowm.get('fecha_devolucion').isoformat() if rowm.get('fecha_devolucion') is not None else None),
            'estado': rowm.get('estado')
        })
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/prestamos', methods=['POST'])
def create_prestamo():
    data = request.get_json() or {}
    # Only Administrador or Recepcionista may create prestamos
    if not _require_roles('Administrador', 'Recepcionista'):
        return jsonify({'error': 'forbidden'}), 403
    # Optionally support adjusting the Libro counts atomically when an id_libro
    # is provided in the payload. This keeps cantidadDisponible/cantidadPrestada
    # consistent when a loan is created from the UI.
    id_libro = data.get('id_libro') or data.get('idLibro')
    cantidad = data.get('cantidad') or 1
    try:
        cantidad = int(cantidad)
        if cantidad < 1:
            cantidad = 1
    except Exception:
        cantidad = 1

    # ensure the cleaned/coerced cantidad is passed into the model factory
    data['cantidad'] = cantidad
    p = Prestamo.from_dict(data)
    try:
        # If id_libro provided, update the Libro counts (ensure availability for requested cantidad)
        if id_libro is not None:
            try:
                lid = int(id_libro)
            except (TypeError, ValueError):
                abort(400, description='invalid id_libro')
            libro = Libro.query.get(lid)
            if not libro:
                abort(404, description='Libro not found')
            if libro.cantidadDisponible < cantidad:
                return jsonify({'error': 'no_copies_available'}), 400
            # decrement available and increment lent by cantidad
            libro.cantidadDisponible = libro.cantidadDisponible - cantidad
            libro.cantidadPrestada = libro.cantidadPrestada + cantidad
            # optional: update estado when none available
            if libro.cantidadDisponible == 0:
                libro.estado = 'Prestado'
            db.session.add(libro)

        db.session.add(p)
        db.session.commit()
        return jsonify(p.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/prestamos/<int:id>', methods=['PUT'])
def update_prestamo(id):
    p = _obj_or_404(Prestamo, id)
    data = request.get_json() or {}
    # Prevent edits to loans that have already been returned. This must
    # apply to all users/roles (including Administrador).
    try:
        estado_actual = (getattr(p, 'estado', '') or '').lower()
        if estado_actual in ('devuelto', 'returned'):
            return jsonify({'error': 'prestamo_devuelto', 'message': 'El préstamo ya fue devuelto y no puede ser editado.'}), 403
    except Exception:
        # If checking estado fails for some reason, fall through and let
        # subsequent validation or DB errors surface.
        pass
    # Before applying updates, capture previous libro link and cantidad (if present)
    prev_libro = getattr(p, 'id_libro', None)
    try:
        prev_cantidad = int(getattr(p, 'cantidad', 1) or 1)
    except Exception:
        prev_cantidad = 1

    # Debug: log incoming update for easier local troubleshooting
    try:
        print(f"[API][update_prestamo] id={id} prev_libro={prev_libro} prev_cantidad={prev_cantidad} incoming_data={repr(data)}")
    except Exception:
        pass

    # Determine requested new values (if provided)
    new_libro = data.get('id_libro') if 'id_libro' in data else (data.get('idLibro') if 'idLibro' in data else prev_libro)
    try:
        new_cantidad = int(data.get('cantidad')) if 'cantidad' in data and data.get('cantidad') is not None else prev_cantidad
        # normalize into data for update_from_dict to consume a clean numeric value
        if 'cantidad' in data:
            data['cantidad'] = new_cantidad
    except Exception:
        new_cantidad = prev_cantidad

    # If the libro link or cantidad will change, adjust Libro counters in a transaction-safe way
    try:
        # Case A: same libro id (or both None) -> adjust delta on that libro
        if new_libro is not None and str(new_libro) == str(prev_libro):
            try:
                delta = new_cantidad - prev_cantidad
                if delta != 0:
                    lid = int(new_libro)
                    libro = Libro.query.get(lid)
                    if not libro:
                        abort(404, description='Libro not found')
                    # If increasing cantidad (delta>0) ensure availability
                    if delta > 0 and libro.cantidadDisponible < delta:
                        return jsonify({'error': 'no_copies_available'}), 400
                    # apply delta: decrease available, increase prestada
                    libro.cantidadDisponible = max(0, (libro.cantidadDisponible or 0) - delta)
                    libro.cantidadPrestada = (libro.cantidadPrestada or 0) + delta
                    db.session.add(libro)
            except Exception:
                # ignore and continue; validation above covers most cases
                pass
        else:
            # Different libro: restore counts to previous libro (if any and loan was active), then deduct from new libro
            if prev_libro is not None:
                try:
                    plid = int(prev_libro)
                    prev_lib = Libro.query.get(plid)
                    if prev_lib:
                        # restore previous counts
                        prev_lib.cantidadDisponible = (prev_lib.cantidadDisponible or 0) + prev_cantidad
                        prev_lib.cantidadPrestada = max(0, (prev_lib.cantidadPrestada or 0) - prev_cantidad)
                        # ensure estado reflects availability
                        if (prev_lib.cantidadDisponible or 0) > 0:
                            prev_lib.estado = prev_lib.estado if prev_lib.estado and prev_lib.estado.lower() != 'prestado' else 'Disponible'
                        db.session.add(prev_lib)
                except Exception:
                    pass
            # deduct from new libro if provided
            if new_libro is not None:
                try:
                    nlid = int(new_libro)
                    new_lib = Libro.query.get(nlid)
                    if not new_lib:
                        abort(404, description='Libro not found')
                    if (new_lib.cantidadDisponible or 0) < new_cantidad:
                        return jsonify({'error': 'no_copies_available'}), 400
                    new_lib.cantidadDisponible = max(0, (new_lib.cantidadDisponible or 0) - new_cantidad)
                    new_lib.cantidadPrestada = (new_lib.cantidadPrestada or 0) + new_cantidad
                    if new_lib.cantidadDisponible == 0:
                        new_lib.estado = 'Prestado'
                    db.session.add(new_lib)
                except Exception:
                    pass

        # Apply updates to Prestamo model
        p.update_from_dict(data)
        db.session.commit()
        return jsonify(p.to_dict())
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/prestamos/<int:id>', methods=['DELETE'])
def delete_prestamo(id):
    p = _obj_or_404(Prestamo, id)
    try:
        # If the prestamo is linked to a libro and it's still active, adjust the Libro counters
        # so available copies are restored when the loan is removed. This is performed
        # in the same DB transaction to keep counts consistent.
        id_libro = getattr(p, 'id_libro', None) or getattr(p, 'idLibro', None) or getattr(p, 'libro_id', None)
        cantidad = getattr(p, 'cantidad', None) or 1
        estado = (getattr(p, 'estado', '') or '').lower()

        # Only restore counts for loans that are active (not already returned)
        if id_libro and estado in ('activo', 'active'):
            try:
                lid = int(id_libro)
            except Exception:
                lid = None
            if lid is not None:
                libro = Libro.query.get(lid)
                if libro:
                    try:
                        c = int(cantidad)
                        if c < 0:
                            c = 1
                    except Exception:
                        c = 1
                    # restore availability and decrement prestada (never negative)
                    libro.cantidadDisponible = (libro.cantidadDisponible or 0) + c
                    libro.cantidadPrestada = max(0, (libro.cantidadPrestada or 0) - c)
                    # if there are available copies, ensure estado reflects availability
                    try:
                        if libro.cantidadDisponible > 0 and (not libro.estado or libro.estado.lower() == 'prestado'):
                            libro.estado = 'Disponible'
                    except Exception:
                        # ignore state update failures; counts are primary
                        pass
                    db.session.add(libro)

        db.session.delete(p)
        db.session.commit()
        return jsonify({'deleted': True})
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': 'internal server error', 'detail': str(e), 'trace': tb}), 500


@api.route('/prestamos/buscar', methods=['GET'])
def buscar_prestamo():
    # Buscar por id_prestamo o por solicitante
    id_prestamo = request.args.get('id_prestamo')
    solicitante = request.args.get('solicitante')
    q = Prestamo.query
    if id_prestamo:
        q = q.filter(Prestamo.id_prestamo == id_prestamo)
    if solicitante:
        q = q.filter(Prestamo.solicitante.ilike(f'%{solicitante}%'))
    results = q.all()
    return jsonify([r.to_dict() for r in results])


# ---------- Devoluciones ----------
@api.route('/devoluciones', methods=['GET'])
def list_devoluciones():
    # Order by fecha_devolucion (DB schema does not have fecha_registro)
    devols = Devolucion.query.order_by(Devolucion.fecha_devolucion.desc()).all()
    return jsonify([d.to_dict() for d in devols])


@api.route('/devoluciones/<int:id>', methods=['GET'])
def get_devolucion(id):
    d = _obj_or_404(Devolucion, id)
    return jsonify(d.to_dict())


@api.route('/devoluciones', methods=['POST'])
def create_devolucion():
    data = request.get_json() or {}
    print(f"[API][create_devolucion] incoming payload: {data}")
    # Normalize date strings to date objects to avoid DB binding issues
    try:
        if data.get('fecha_prestamo') and isinstance(data.get('fecha_prestamo'), str):
            # accept YYYY-MM-DD or ISO datetime
            try:
                data['fecha_prestamo'] = datetime.fromisoformat(data['fecha_prestamo']).date()
            except Exception:
                try:
                    data['fecha_prestamo'] = datetime.strptime(data['fecha_prestamo'], '%Y-%m-%d').date()
                except Exception:
                    pass
        if data.get('fecha_devolucion') and isinstance(data.get('fecha_devolucion'), str):
            try:
                data['fecha_devolucion'] = datetime.fromisoformat(data['fecha_devolucion']).date()
            except Exception:
                try:
                    data['fecha_devolucion'] = datetime.strptime(data['fecha_devolucion'], '%Y-%m-%d').date()
                except Exception:
                    pass
    except Exception:
        # continue even if date coercion fails; we'll let DB layer report errors
        pass
    # quick pre-check: if a devolucion for the same prestamo already exists, return it
    try:
        if data.get('id_prestamo'):
            existing = Devolucion.query.filter_by(id_prestamo=data.get('id_prestamo')).first()
            if existing:
                return jsonify(existing.to_dict()), 200
    except Exception:
        # ignore and continue
        pass
    # Build ORM object
    d = Devolucion.from_dict(data)
    # If an id_prestamo is provided, attempt to update related Prestamo and Libro counts
    prestamo_obj = None
    libro_obj = None
    cantidad_a_restaurar = None
    try:
        if data.get('id_prestamo'):
            try:
                prestamo_obj = Prestamo.query.get(int(data.get('id_prestamo')))
            except Exception:
                prestamo_obj = None
        if prestamo_obj:
            # determine cantidad to restore from the prestamo record
            try:
                cantidad_a_restaurar = int(getattr(prestamo_obj, 'cantidad', 1) or 1)
            except Exception:
                cantidad_a_restaurar = 1
            # if prestamo links to a libro, load it
            try:
                if getattr(prestamo_obj, 'id_libro', None) is not None:
                    libro_obj = Libro.query.get(getattr(prestamo_obj, 'id_libro'))
            except Exception:
                libro_obj = None

    except Exception:
        # ignore pre-load errors and proceed with insertion; we'll try to reconcile later
        prestamo_obj = None
        libro_obj = None

    # Prepare session changes
    db.session.add(d)
    if prestamo_obj:
        # mark prestamo as devuelto if it was active
        try:
            estado_actual = (getattr(prestamo_obj, 'estado', '') or '').lower()
            if estado_actual not in ('devuelto', 'returned'):
                prestamo_obj.estado = 'Devuelto'
                db.session.add(prestamo_obj)
        except Exception:
            pass
    if libro_obj and cantidad_a_restaurar is not None:
        try:
            # restore availability and decrement prestada
            libro_obj.cantidadDisponible = (libro_obj.cantidadDisponible or 0) + int(cantidad_a_restaurar)
            libro_obj.cantidadPrestada = max(0, (libro_obj.cantidadPrestada or 0) - int(cantidad_a_restaurar))
            # ensure estado is updated if copies available
            try:
                if libro_obj.cantidadDisponible > 0 and (not libro_obj.estado or libro_obj.estado.lower() == 'prestado'):
                    libro_obj.estado = 'Disponible'
            except Exception:
                pass
            db.session.add(libro_obj)
        except Exception:
            pass

    try:
        db.session.commit()
        return jsonify(d.to_dict()), 201
    except IntegrityError as e:
        db.session.rollback()
        # if duplicate by prestamo, return existing
        try:
            existing = None
            if data.get('id_prestamo'):
                existing = Devolucion.query.filter_by(id_prestamo=data.get('id_prestamo')).first()
            if existing:
                return jsonify(existing.to_dict()), 200
        except Exception:
            pass
        return jsonify({'error': 'database integrity error', 'detail': str(e.orig)}), 400
    except Exception as e:
        # Fallback for SQL Server triggers causing OUTPUT/INSERT problems.
        db.session.rollback()
        import traceback as _tb
        tb = _tb.format_exc()
        msg = str(e)

        # Try quick existing check again
        try:
            if data.get('id_prestamo'):
                existing = Devolucion.query.filter_by(id_prestamo=data.get('id_prestamo')).first()
                if existing:
                    return jsonify(existing.to_dict()), 200
        except Exception:
            pass

        # Raw insert fallback: perform INSERT then SELECT by id_prestamo, and also update prestamo/libro counts
        from sqlalchemy import text
        try:
            engine = db.session.get_bind()
            insert_sql = text(
                "INSERT INTO devoluciones (id_libro, id_prestamo, fecha_prestamo, fecha_devolucion, estado_prestamo) "
                "VALUES (:id_libro, :id_prestamo, :fecha_prestamo, :fecha_devolucion, :estado_prestamo);"
            )
            params = {
                'id_libro': data.get('id_libro'),
                'id_prestamo': data.get('id_prestamo'),
                'fecha_prestamo': data.get('fecha_prestamo'),
                'fecha_devolucion': data.get('fecha_devolucion'),
                'estado_prestamo': data.get('estado_prestamo') or data.get('estado')
            }
            with engine.begin() as conn:
                print(f"[API-FALLBACK-DEV] raw INSERT devolucion for prestamo={data.get('id_prestamo')}")
                conn.execute(insert_sql, params)
                # If prestamo exists, update prestamo.estado and libro counters via raw SQL
                if data.get('id_prestamo'):
                    try:
                        # mark prestamo as Devuelto
                        conn.execute(text("UPDATE prestamos SET estado = :estado WHERE id_prestamo = :id"), {'estado': 'Devuelto', 'id': data.get('id_prestamo')})
                        # try to obtain prestamo row to get cantidad and id_libro
                        row = conn.execute(text("SELECT id_libro, cantidad FROM prestamos WHERE id_prestamo = :id"), {'id': data.get('id_prestamo')}).fetchone()
                        if row and row[0] is not None:
                            pl_lib_id = row[0]
                            pl_cantidad = int(row[1] or 1)
                            # update libro counts
                            conn.execute(text("UPDATE libros SET cantidadDisponible = ISNULL(cantidadDisponible,0) + :c, cantidadPrestada = CASE WHEN ISNULL(cantidadPrestada,0) - :c < 0 THEN 0 ELSE ISNULL(cantidadPrestada,0) - :c END WHERE idLibro = :lid"), {'c': pl_cantidad, 'lid': pl_lib_id})
                    except Exception:
                        # ignore individual update errors
                        pass

                row = None
                if data.get('id_prestamo'):
                    row = conn.execute(text("SELECT id_devolucion FROM devoluciones WHERE id_prestamo = :id_prestamo"), {'id_prestamo': data.get('id_prestamo')}).fetchone()
                else:
                    # if no id_prestamo, try to find by libro + fecha
                    if data.get('id_libro') and data.get('fecha_devolucion'):
                        row = conn.execute(text("SELECT id_devolucion FROM devoluciones WHERE id_libro = :id_libro AND fecha_devolucion = :fecha"), {'id_libro': data.get('id_libro'), 'fecha': data.get('fecha_devolucion')}).fetchone()
                print(f"[API-FALLBACK-DEV] select result: {row}")

            if row and row[0] is not None:
                new_id = int(row[0])
                new_obj = Devolucion.query.get(new_id)
                if new_obj:
                    return jsonify(new_obj.to_dict()), 201

            return jsonify({'error': 'fallback failed', 'original': msg, 'trace': tb}), 500
        except Exception as e2:
            db.session.rollback()
            tb2 = _tb.format_exc()
            print(f"[API-FALLBACK-DEV][ERROR] {e2}\n{tb2}")
            try:
                if data.get('id_prestamo'):
                    existing = Devolucion.query.filter_by(id_prestamo=data.get('id_prestamo')).first()
                    if existing:
                        return jsonify(existing.to_dict()), 200
            except Exception:
                pass
            return jsonify({'error': 'fallback failed', 'original': msg, 'trace': tb2}), 500


@api.route('/devoluciones/<int:id>', methods=['PUT'])
def update_devolucion(id):
    d = _obj_or_404(Devolucion, id)
    data = request.get_json() or {}
    d.update_from_dict(data)
    db.session.commit()
    return jsonify(d.to_dict())


@api.route('/devoluciones/<int:id>', methods=['DELETE'])
def delete_devolucion(id):
    d = _obj_or_404(Devolucion, id)
    db.session.delete(d)
    db.session.commit()
    return jsonify({'deleted': True})


# ---------- Usuarios, Roles, Loggeo (CRUD mínimo) ----------
@api.route('/usuarios', methods=['GET'])
def list_usuarios():
    users = Usuario.query.all()
    return jsonify([u.to_dict() for u in users])


@api.route('/usuarios/<int:id>', methods=['GET'])
def get_usuario(id):
    u = _obj_or_404(Usuario, id)
    return jsonify(u.to_dict())


@api.route('/usuarios', methods=['POST'])
def create_usuario():
    data = request.get_json() or {}
    u = Usuario.from_dict(data)
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict()), 201


@api.route('/usuarios/<int:id>', methods=['PUT'])
def update_usuario(id):
    # Only Administrador may update usuarios
    if not _require_roles('Administrador'):
        return jsonify({'error': 'forbidden'}), 403
    u = _obj_or_404(Usuario, id)
    data = request.get_json() or {}
    # coerce id_rol to int when present
    if 'id_rol' in data and data.get('id_rol') is not None:
        try:
            data['id_rol'] = int(data['id_rol'])
        except Exception:
            abort(400, description='invalid id_rol')
    try:
        u.update_from_dict(data)
        db.session.commit()
        return jsonify(u.to_dict())
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'error': 'integrity error', 'detail': str(e.orig)}), 400
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


@api.route('/usuarios/<int:id>', methods=['DELETE'])
def delete_usuario(id):
    # Only Administrador may delete usuarios
    if not _require_roles('Administrador'):
        return jsonify({'error': 'forbidden'}), 403
    u = _obj_or_404(Usuario, id)
    try:
        db.session.delete(u)
        db.session.commit()
        return jsonify({'deleted': True})
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


@api.route('/roles', methods=['GET'])
def list_roles():
    try:
        roles = Rol.query.all()
        return jsonify([r.to_dict() for r in roles])
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


@api.route('/roles', methods=['POST'])
def create_role():
    try:
        data = request.get_json() or {}
        nombre = data.get('nombre_rol')
        if not nombre:
            abort(400, description='nombre_rol is required')
        # prevent duplicates
        existing = Rol.query.filter_by(nombre_rol=nombre).first()
        if existing:
            return jsonify(existing.to_dict()), 200
        r = Rol(nombre_rol=nombre, descripcion=data.get('descripcion'))
        db.session.add(r)
        db.session.commit()
        return jsonify(r.to_dict()), 201
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'error': 'integrity error', 'detail': str(e.orig)}), 400
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


@api.route('/roles/<int:id>', methods=['PUT'])
def update_role(id):
    try:
        r = _obj_or_404(Rol, id)
        data = request.get_json() or {}
        if 'nombre_rol' in data:
            r.nombre_rol = data['nombre_rol']
        if 'descripcion' in data:
            r.descripcion = data['descripcion']
        db.session.commit()
        return jsonify(r.to_dict())
    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'error': 'integrity error', 'detail': str(e.orig)}), 400
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


@api.route('/loggeo', methods=['POST'])
def create_loggeo():
    data = request.get_json() or {}
    l = Loggeo.from_dict(data)
    db.session.add(l)
    db.session.commit()
    return jsonify(l.to_dict()), 201


@api.route('/loggeo', methods=['GET'])
def list_loggeo():
    """List loggeo entries. Optional query param `id_usuario` to filter by user id.

    Returns entries ordered by fecha_login desc so clients can determine latest state.
    """
    try:
        id_usuario = request.args.get('id_usuario') or request.args.get('user_id')
        q = Loggeo.query
        if id_usuario:
            try:
                uid = int(id_usuario)
                q = q.filter(Loggeo.id_usuario == uid)
            except Exception:
                # ignore filter if invalid
                pass
        rows = q.order_by(Loggeo.fecha_login.desc()).all()
        return jsonify([r.to_dict() for r in rows])
    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500


# ---------- Admin: wipe (destructive) ----------
@api.route('/admin/wipe', methods=['POST'])
def admin_wipe():
    """Destructively delete all rows from application tables and reseed identities.

    This endpoint is intentionally protected: it requires an Authorization header
    with a bearer token that matches the POPULATE_WIPE_TOKEN environment variable.
    Only use from a trusted network and with the appropriate token set.
    """
    expected = os.getenv('POPULATE_WIPE_TOKEN')
    auth = request.headers.get('Authorization')
    if not expected:
        return jsonify({'error': 'wipe not enabled on server (POPULATE_WIPE_TOKEN unset)'}), 403
    if not auth or auth.strip() != f'Bearer {expected}':
        return jsonify({'error': 'unauthorized'}), 403

    # Perform deletes in order to respect foreign keys: Devoluciones -> Prestamos -> Libros -> Usuarios -> Roles -> Loggeo
    try:
        # Use the ORM delete for portability
        Devolucion.query.delete()
        Prestamo.query.delete()
        # Delete libros after devoluciones
        Libro.query.delete()
        Usuario.query.delete()
        Rol.query.delete()
        Loggeo.query.delete()
        db.session.commit()

        # Reseed identity/autoincrement for known dialects (SQL Server, MySQL, SQLite)
        engine = db.session.get_bind()
        dialect = engine.dialect.name
        # list of table names as in models
        tables = [
            Libro.__tablename__,
            Prestamo.__tablename__,
            Devolucion.__tablename__,
            Usuario.__tablename__,
            Rol.__tablename__,
            Loggeo.__tablename__,
        ]
        from sqlalchemy import text
        # Use a connection context (engine.begin()) because Engine.execute was removed
        # in modern SQLAlchemy. Execute statements using the connection object.
        if dialect == 'mssql':
            with engine.begin() as conn:
                for t in tables:
                    # DBCC requires the object name; using default schema dbo
                    conn.execute(text(f"DBCC CHECKIDENT ('{t}', RESEED, 0)"))
        elif dialect in ('mysql', 'mariadb'):
            with engine.begin() as conn:
                for t in tables:
                    conn.execute(text(f"ALTER TABLE {t} AUTO_INCREMENT = 1"))
        elif dialect == 'sqlite':
            with engine.begin() as conn:
                for t in tables:
                    conn.execute(text("DELETE FROM sqlite_sequence WHERE name=:name"), {'name': t})

        return jsonify({'wiped': True, 'tables_cleared': tables}), 200
    except Exception as e:
        db.session.rollback()
        tb = traceback.format_exc()
        return jsonify({'error': str(e), 'trace': tb}), 500
