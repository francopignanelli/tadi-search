$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
    python -m venv (Join-Path $Root ".venv")
    & $Python -m pip install --upgrade pip
    & $Python -m pip install -r (Join-Path $Root "requirements.txt")
}

Push-Location (Join-Path $Root "backend")
& $Python -m uvicorn app:app --host 127.0.0.1 --port 8000
Pop-Location
