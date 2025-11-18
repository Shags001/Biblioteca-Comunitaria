
document.addEventListener('DOMContentLoaded', function() {
    
    // Array para almacenar las devoluciones (temporal - luego vendrá de BD)
    let devoluciones = [];
    
    
    // SIMULACIÓN DE LLAMADAS A BASE DE DATOS
    
    
    /**
     * Función para obtener información de un préstamo desde la BD
     * TODO: Reemplazar con llamada real a la base de datos
     * Tabla: prestamos
     * Campos necesarios: id_prestamo, nombre_responsable, isbn, titulo, fecha_prestamo, fecha_devolucion_esperada
     * 
     * La búsqueda puede ser por:
     * - Solo ID de préstamo
     * - Solo nombre del responsable
     * - Ambos (validación cruzada)
     */
    async function obtenerPrestamo(idPrestamo, nombreResponsable) {
        // SIMULACIÓN - Reemplazar con fetch real:
        // const params = new URLSearchParams();
        // if (idPrestamo) params.append('id_prestamo', idPrestamo);
        // if (nombreResponsable) params.append('nombre_responsable', nombreResponsable);
        // const response = await fetch(`/api/prestamos/buscar?${params}`);
        // return await response.json();
        
        const prestamosSimulados = [
            {
                id_prestamo: 'P001',
                nombre_responsable: 'Juan Pérez',
                isbn: '978-3-16-148410-0',
                titulo: 'Cien Años de Soledad',
                fecha_prestamo: '2024-10-15',
                fecha_devolucion_esperada: '2024-11-15'
            },
            {
                id_prestamo: 'P002',
                nombre_responsable: 'María González',
                isbn: '978-0-14-017739-8',
                titulo: 'El Diseño de la Comunidad',
                fecha_prestamo: '2024-10-20',
                fecha_devolucion_esperada: '2024-11-20'
            },
            {
                id_prestamo: 'P003',
                nombre_responsable: 'Carlos Ramírez',
                isbn: '978-0-452-28423-4',
                titulo: 'Historia de El Salvador',
                fecha_prestamo: '2024-10-25',
                fecha_devolucion_esperada: '2024-11-25'
            }
        ];
        
        // Buscar por ID o Nombre o ambos
        let resultado = null;
        
        if (idPrestamo && nombreResponsable) {
            // Búsqueda con validación cruzada
            resultado = prestamosSimulados.find(p => 
                p.id_prestamo.toUpperCase() === idPrestamo.toUpperCase() && 
                p.nombre_responsable.toLowerCase() === nombreResponsable.toLowerCase()
            );
        } else if (idPrestamo) {
            // Solo por ID
            resultado = prestamosSimulados.find(p => 
                p.id_prestamo.toUpperCase() === idPrestamo.toUpperCase()
            );
        } else if (nombreResponsable) {
            // Solo por Nombre
            resultado = prestamosSimulados.find(p => 
                p.nombre_responsable.toLowerCase() === nombreResponsable.toLowerCase()
            );
        }
        
        return resultado || null;
    }
    
    /**
     * Función para guardar una devolución en la base de datos
     * TODO: Reemplazar con llamada real a la base de datos
     * Tabla: devoluciones
     * Campos: id_prestamo, nombre_responsable, isbn, titulo_libro, fecha_prestamo, 
     *         fecha_devolucion_esperada, estado, fecha_devolucion_real, fecha_registro
     */
    async function guardarDevolucionEnBD(devolucion) {
        // SIMULACIÓN - Reemplazar con fetch real:
        // const response = await fetch('/api/devoluciones', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(devolucion)
        // });
        // return await response.json();
        
        console.log(' Guardando en BD - Tabla: devoluciones');
        console.log(devolucion);
        return { success: true, id: Date.now() };
    }
    
    /**
     * Función para obtener todas las devoluciones desde la base de datos
     * TODO: Reemplazar con llamada real a la base de datos
     * Tabla: devoluciones
     */
    async function obtenerTodasLasDevoluciones() {
        // SIMULACIÓN - Reemplazar con fetch real:
        // const response = await fetch('/api/devoluciones');
        // return await response.json();
        
        console.log(' Cargando devoluciones desde BD - Tabla: devoluciones');
        return [];
    }


    // ELEMENTOS DEL DOM

    const formDevolucion = document.getElementById('formDevolucion');
    const idPrestamoInput = document.getElementById('idPrestamo');
    const nombreResponsableInput = document.getElementById('nombreResponsable');
    const isbnInput = document.getElementById('isbn');
    const tituloLibroInput = document.getElementById('tituloLibro');
    const fechaPrestamoInput = document.getElementById('fechaPrestamo');
    const fechaDevolucionEsperadaInput = document.getElementById('fechaDevolucionEsperada');
    const estadoSelect = document.getElementById('estado');
    const fechaDevolucionRealInput = document.getElementById('fechaDevolucionReal');
    const btnLimpiar = document.querySelector('.btn-secundario');
    
    // Elementos de filtros
    const filtroFecha = document.getElementById('filtroFecha');
    const filtroISBN = document.getElementById('filtroISBN');
    const filtroEstado = document.getElementById('filtroEstado');
    
    // Contenedor del historial
    const historialContainer = document.querySelector('.seccion-card:last-of-type');

    // Variable para controlar la búsqueda
    let timeoutBusqueda = null;


    // AUTOCOMPLETAR DATOS AL INGRESAR INFORMACIÓN

    
    async function buscarYAutocompletar() {
        const idPrestamo = idPrestamoInput.value.trim();
        const nombreResponsable = nombreResponsableInput.value.trim();
        
        // Solo buscar si hay al menos un campo con información
        if (!idPrestamo && !nombreResponsable) {
            limpiarCamposAutocompletados();
            return;
        }
        
        // Llamar a la BD para obtener info del préstamo
        const prestamo = await obtenerPrestamo(idPrestamo, nombreResponsable);
        
        if (prestamo) {
            // Autocompletar todos los campos
            idPrestamoInput.value = prestamo.id_prestamo;
            nombreResponsableInput.value = prestamo.nombre_responsable;
            isbnInput.value = prestamo.isbn;
            tituloLibroInput.value = prestamo.titulo;
            fechaPrestamoInput.value = prestamo.fecha_prestamo;
            fechaDevolucionEsperadaInput.value = prestamo.fecha_devolucion_esperada;
            
            // Remover borde de error si existía
            idPrestamoInput.style.borderColor = '';
            nombreResponsableInput.style.borderColor = '';
        } else {
            // No se encontró el préstamo
            if (idPrestamo || nombreResponsable) {
                limpiarCamposAutocompletados();
                
                // Indicar visualmente que no se encontró
                if (idPrestamo) idPrestamoInput.style.borderColor = '#D4AAAA';
                if (nombreResponsable) nombreResponsableInput.style.borderColor = '#D4AAAA';
            }
        }
    }
    
    function limpiarCamposAutocompletados() {
        isbnInput.value = '';
        tituloLibroInput.value = '';
        fechaPrestamoInput.value = '';
        fechaDevolucionEsperadaInput.value = '';
    }
    
    // Buscar cuando se sale del campo (blur)
    idPrestamoInput.addEventListener('blur', buscarYAutocompletar);
    nombreResponsableInput.addEventListener('blur', buscarYAutocompletar);
    
    // Buscar mientras escribe (con delay)
    idPrestamoInput.addEventListener('input', function() {
        clearTimeout(timeoutBusqueda);
        timeoutBusqueda = setTimeout(buscarYAutocompletar, 500);
    });
    
    nombreResponsableInput.addEventListener('input', function() {
        clearTimeout(timeoutBusqueda);
        timeoutBusqueda = setTimeout(buscarYAutocompletar, 500);
    });


    // FUNCIÓN PARA OBTENER ESTADO Y CLASE

    function obtenerEstadoYClase(estadoManual) {
        const mapaEstados = {
            'devuelto_tiempo': { estado: 'A TIEMPO', clase: 'badge-verde' },
            'devuelto_retraso': { estado: 'RETRASADO', clase: 'badge-amarillo' },
            'danado': { estado: 'DAÑADO', clase: 'badge-rojo' }
        };
        
        return mapaEstados[estadoManual] || { estado: 'DESCONOCIDO', clase: 'badge-rojo' };
    }


    // FUNCIÓN PARA CREAR HTML DEL REGISTRO

    function crearRegistroHTML(devolucion) {
        const estadoInfo = obtenerEstadoYClase(devolucion.estado);
        
        const html = '<div class="registro-historial" data-id="' + devolucion.id + '" data-isbn="' + devolucion.isbn + '">' +
            '<div class="registro-header-historial">' +
                '<h3 class="registro-titulo-historial">' + devolucion.titulo_libro + '</h3>' +
                '<span class="badge-estado badge-devuelto">DEVUELTO</span>' +
            '</div>' +
            '<p class="registro-info-text">ID: ' + devolucion.id_prestamo + ' | Responsable: ' + devolucion.nombre_responsable + '</p>' +
            '<p class="registro-info-text">' + formatearFechaHora(devolucion.fecha_registro) + '</p>' +
            '<div class="registro-footer-historial">' +
                '<span class="badge-tiempo ' + estadoInfo.clase + '">' + estadoInfo.estado + '</span>' +
            '</div>' +
        '</div>';
        
        return html;
    }

    
    // FUNCIONES AUXILIARES PARA FORMATEAR FECHAS
    
    function formatearFecha(fecha) {
        const partes = fecha.split('-');
        const anio = partes[0];
        const mes = partes[1];
        const dia = partes[2];
        return dia + '/' + mes + '/' + anio;
    }

    function formatearFechaHora(fecha) {
        const date = new Date(fecha);
        const dia = String(date.getDate()).padStart(2, '0');
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const año = date.getFullYear();
        const horas = String(date.getHours()).padStart(2, '0');
        const minutos = String(date.getMinutes()).padStart(2, '0');
        return dia + '/' + mes + '/' + año + ' ' + horas + ':' + minutos + ' Horas';
    }

    
    // FUNCIÓN PARA RENDERIZAR EL HISTORIAL
    
    function renderizarHistorial(devolucionesFiltradas) {
        if (!devolucionesFiltradas) {
            devolucionesFiltradas = devoluciones;
        }
        
        // Encontrar el contenedor después del subtítulo
        const subtitulo = historialContainer.querySelector('.subtitulo-seccion');
        
        // Limpiar registros existentes
        const registrosExistentes = historialContainer.querySelectorAll('.registro-historial');
        registrosExistentes.forEach(function(registro) {
            registro.remove();
        });
        
        // Limpiar mensaje vacío si existe
        const mensajeVacio = historialContainer.querySelector('.mensaje-vacio');
        if (mensajeVacio) {
            mensajeVacio.remove();
        }
        
        if (devolucionesFiltradas.length === 0) {
            const mensajeVacio = document.createElement('p');
            mensajeVacio.style.textAlign = 'center';
            mensajeVacio.style.color = '#6B7280';
            mensajeVacio.style.padding = '20px';
            mensajeVacio.textContent = 'No hay devoluciones registradas';
            mensajeVacio.classList.add('mensaje-vacio');
            subtitulo.insertAdjacentElement('afterend', mensajeVacio);
            return;
        }
        
        // Ordenar por fecha de registro (más reciente primero)
        devolucionesFiltradas.sort(function(a, b) {
            return new Date(b.fecha_registro) - new Date(a.fecha_registro);
        });
        
        // Agregar cada registro después del subtítulo
        devolucionesFiltradas.forEach(function(devolucion) {
            const registroHTML = crearRegistroHTML(devolucion);
            subtitulo.insertAdjacentHTML('afterend', registroHTML);
        });
    }


    // VALIDACIONES DEL FORMULARIO

    function validarFormulario() {
        const errores = [];
        
        // Validar ID Préstamo
        const idPrestamo = idPrestamoInput.value.trim();
        if (!idPrestamo) {
            errores.push('El ID de Préstamo es obligatorio');
        }
        
        // Validar Nombre del Responsable
        const nombreResponsable = nombreResponsableInput.value.trim();
        if (!nombreResponsable) {
            errores.push('El Nombre del Responsable es obligatorio');
        }
        
        // Validar que se haya autocompletado la información
        if (!tituloLibroInput.value || !isbnInput.value) {
            errores.push('No se encontró información del préstamo. Verifique el ID y el nombre del responsable');
        }
        
        // Validar estado
        if (!estadoSelect.value) {
            errores.push('Debe seleccionar un estado');
        }
        
        // Validar fecha de devolución real
        if (!fechaDevolucionRealInput.value) {
            errores.push('La fecha de devolución es obligatoria');
        } else {
            const fechaReal = new Date(fechaDevolucionRealInput.value);
            const fechaPrestamo = new Date(fechaPrestamoInput.value);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            
            if (fechaReal > hoy) {
                errores.push('La fecha de devolución no puede ser futura');
            }
            
            if (fechaReal < fechaPrestamo) {
                errores.push('La fecha de devolución no puede ser anterior a la fecha de préstamo');
            }
        }
        
        return errores;
    }


    // ENVIAR FORMULARIO - REGISTRAR DEVOLUCIÓN

    formDevolucion.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Validar formulario
        const errores = validarFormulario();
        
        if (errores.length > 0) {
            alert('Por favor corrija los siguientes errores:\n\n' + errores.join('\n'));
            return;
        }
        
        // Crear objeto de devolución con estructura para BD
        const nuevaDevolucion = {
            id_prestamo: idPrestamoInput.value.trim().toUpperCase(),
            nombre_responsable: nombreResponsableInput.value.trim(),
            isbn: isbnInput.value,
            titulo_libro: tituloLibroInput.value,
            fecha_prestamo: fechaPrestamoInput.value,
            fecha_devolucion_esperada: fechaDevolucionEsperadaInput.value,
            estado: estadoSelect.value,
            fecha_devolucion_real: fechaDevolucionRealInput.value,
            fecha_registro: new Date().toISOString()
        };
        
        // Guardar en la base de datos
        const resultado = await guardarDevolucionEnBD(nuevaDevolucion);
        
        if (resultado.success) {
            // Agregar ID generado por la BD
            nuevaDevolucion.id = resultado.id;
            
            // Agregar al array local
            devoluciones.push(nuevaDevolucion);
            
            // Renderizar historial
            renderizarHistorial();
            
            // Mostrar mensaje de éxito
            alert('✅ ¡Devolución registrada exitosamente!');
            
            // Limpiar formulario
            limpiarFormulario();
        } else {
            alert('❌ Error al guardar la devolución. Intente nuevamente.');
        }
    });


    // BOTÓN LIMPIAR

    btnLimpiar.addEventListener('click', function() {
        limpiarFormulario();
    });

    function limpiarFormulario() {
        formDevolucion.reset();
        isbnInput.value = '';
        tituloLibroInput.value = '';
        fechaPrestamoInput.value = '';
        fechaDevolucionEsperadaInput.value = '';
        idPrestamoInput.style.borderColor = '';
        nombreResponsableInput.style.borderColor = '';
    }


    // FILTROS DE BÚSQUEDA

    function aplicarFiltros() {
        const fechaFiltro = filtroFecha.value;
        const isbnFiltro = filtroISBN.value.trim().toLowerCase();
        const estadoFiltro = filtroEstado.value;
        
        const devolucionesFiltradas = devoluciones.filter(function(devolucion) {
            let cumpleFecha = true;
            let cumpleISBN = true;
            let cumpleEstado = true;
            
            // Filtrar por fecha
            if (fechaFiltro) {
                cumpleFecha = devolucion.fecha_devolucion_real === fechaFiltro;
            }
            
            // Filtrar por ISBN
            if (isbnFiltro) {
                cumpleISBN = devolucion.isbn.toLowerCase().includes(isbnFiltro);
            }
            
            // Filtrar por estado (mapeo directo)
            if (estadoFiltro) {
                const mapaFiltros = {
                    'opt1': 'devuelto_tiempo',  // A tiempo
                    'opt2': 'devuelto_retraso',  // Retrasado
                    'opt3': 'danado'             // Dañado
                };
                
                cumpleEstado = devolucion.estado === mapaFiltros[estadoFiltro];
            }
            
            return cumpleFecha && cumpleISBN && cumpleEstado;
        });
        
        renderizarHistorial(devolucionesFiltradas);
    }

    // Escuchar cambios en los filtros
    filtroFecha.addEventListener('change', aplicarFiltros);
    filtroISBN.addEventListener('input', aplicarFiltros);
    filtroEstado.addEventListener('change', aplicarFiltros);


    // ESTABLECER FECHA MÁXIMA PARA FECHA DE DEVOLUCIÓN REAL

    const hoy = new Date().toISOString().split('T')[0];
    fechaDevolucionRealInput.setAttribute('max', hoy);


    // INICIALIZACIÓN - CARGAR DEVOLUCIONES DESDE BD

    async function inicializar() {
        console.log(' Sistema de Gestión de Devoluciones iniciado');
        
        // Cargar devoluciones existentes desde la BD
        devoluciones = await obtenerTodasLasDevoluciones();
        
        // Renderizar historial
        renderizarHistorial();
        
        console.log(' Devoluciones cargadas:', devoluciones.length);
    }
    
    // Ejecutar inicialización
    inicializar();
});