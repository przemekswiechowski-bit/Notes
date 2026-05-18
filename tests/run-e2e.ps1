$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$chrome = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
$profile = Join-Path $env:TEMP "notes-e2e-profile"

if (-not (Test-Path $chrome)) {
  throw "Chrome not found at $chrome"
}

if (Test-Path $profile) {
  Remove-Item -LiteralPath $profile -Recurse -Force
}
New-Item -ItemType Directory -Path $profile | Out-Null

$args = @(
  "--headless=new",
  "--disable-gpu",
  "--enable-automation",
  "--remote-debugging-port=9333",
  "--user-data-dir=$profile",
  "http://127.0.0.1:4173/"
)

$chromeProcess = Start-Process -FilePath $chrome -ArgumentList $args -PassThru -WindowStyle Hidden

try {
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9333/json/version | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  if (-not $ready) {
    throw "Chrome DevTools port 9333 did not become ready"
  }

  $env:NOTES_E2E_ISOLATED_PROFILE = "1"
  node (Join-Path $PSScriptRoot "e2e-cdp.mjs")
  $testExitCode = $LASTEXITCODE
  if ($testExitCode -ne 0) {
    throw "E2E test failed with exit code $testExitCode"
  }
} finally {
  try {
    node -e "fetch('http://127.0.0.1:9333/json/version').then(r=>r.json()).then(v=>{const ws=new WebSocket(v.webSocketDebuggerUrl); ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Browser.close'}))); setTimeout(()=>process.exit(0),1000);}).catch(()=>process.exit(0))"
  } catch {}
  if (-not $chromeProcess.HasExited) {
    Stop-Process -Id $chromeProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item Env:\NOTES_E2E_ISOLATED_PROFILE -ErrorAction SilentlyContinue
}
