// Pequeño cliente fetch para llamadas JSON a la API.
// Usa credenciales same-origin para enviar cookies de sesión de Flask.

async function fetchJson(method, path, data) {
    const opts = {
        method: method,
        headers: {
            'Accept': 'application/json'
        },
        credentials: 'same-origin'
    };
    if (data != null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(data);
    }

    const res = await fetch(path, opts);
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (e) {
        // no JSON body
        json = null;
    }
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`);
        err.status = res.status;
        err.body = json || text;
        throw err;
    }
    return json;
}

export async function getJson(path) {
    return fetchJson('GET', path, null);
}

export async function postJson(path, data) {
    return fetchJson('POST', path, data);
}

export async function putJson(path, data) {
    return fetchJson('PUT', path, data);
}

export async function deleteJson(path) {
    return fetchJson('DELETE', path, null);
}
