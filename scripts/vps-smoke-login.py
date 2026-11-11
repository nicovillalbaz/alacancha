"""Verifica el ingreso local de producción sin imprimir ni transmitir la clave fuera del VPS."""

import json
from pathlib import Path
from urllib.request import Request, urlopen

content = Path('/srv/torneos/first-login.txt').read_text().splitlines()
username = content[0].split(': ', 1)[1]
password = content[1].split(': ', 1)[1]
body = json.dumps({'username': username, 'password': password}).encode()
request = Request('http://127.0.0.1:4312/api/v1/auth/login', body, {'Content-Type': 'application/json'})
with urlopen(request, timeout=10) as response:
    account = json.load(response)
    assert response.status == 200
    assert account['username'] == username
    assert account['platformAdmin'] is True
print('Ingreso de superadministrador verificado en la API local.')
