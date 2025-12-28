# Script para atualizar valores de creditos na landing page compilada
$ErrorActionPreference = "Stop"

$files = @(
    "Backend\landing-dist\assets\index-CJf_7i13.js",
    "Backend\landing-dist\assets\index-D74MUa4q.js"
)

foreach ($filePath in $files) {
    if (Test-Path $filePath) {
        Write-Host "Processando: $filePath"
        
        # Ler arquivo
        $content = [System.IO.File]::ReadAllText((Resolve-Path $filePath).Path, [System.Text.Encoding]::UTF8)
        $originalLength = $content.Length
        
        # Substituicoes para FREE (100 -> 50)
        $content = $content -replace '\b100\b(?![0-9])', '50'
        $content = $content -replace '"100"', '"50"'
        $content = $content -replace ':100,', ':50,'
        $content = $content -replace ':100}', ':50}'
        $content = $content -replace '100 creditos', '50 creditos'
        $content = $content -replace '100 creditos/mes', '50 creditos/mes'
        
        # Substituicoes para START (1000 -> 800)
        $content = $content -replace '\b1000\b(?![0-9])', '800'
        $content = $content -replace '"1000"', '"800"'
        $content = $content -replace ':1000,', ':800,'
        $content = $content -replace ':1000}', ':800}'
        $content = $content -replace '1000 creditos', '800 creditos'
        $content = $content -replace '1000 creditos/mes', '800 creditos/mes'
        $content = $content -replace '1\.000 creditos', '800 creditos'
        $content = $content -replace '1,000 creditos', '800 creditos'
        
        # Substituicoes para TURBO (2500 -> 1600)
        $content = $content -replace '\b2500\b(?![0-9])', '1600'
        $content = $content -replace '"2500"', '"1600"'
        $content = $content -replace ':2500,', ':1600,'
        $content = $content -replace ':2500}', ':1600}'
        $content = $content -replace '2500 creditos', '1600 creditos'
        $content = $content -replace '2500 creditos/mes', '1600 creditos/mes'
        $content = $content -replace '2\.500 creditos', '1.600 creditos'
        $content = $content -replace '2,500 creditos', '1.600 creditos'
        
        # Substituicoes para MASTER (5000 -> 2400)
        $content = $content -replace '\b5000\b(?![0-9])', '2400'
        $content = $content -replace '"5000"', '"2400"'
        $content = $content -replace ':5000,', ':2400,'
        $content = $content -replace ':5000}', ':2400}'
        $content = $content -replace '5000 creditos', '2400 creditos'
        $content = $content -replace '5000 creditos/mes', '2400 creditos/mes'
        $content = $content -replace '5\.000 creditos', '2.400 creditos'
        $content = $content -replace '5,000 creditos', '2.400 creditos'
        
        # Salvar arquivo
        [System.IO.File]::WriteAllText((Resolve-Path $filePath).Path, $content, [System.Text.Encoding]::UTF8)
        
        $changes = $content.Length - $originalLength
        Write-Host "  Concluido! ($changes caracteres alterados)"
    } else {
        Write-Host "  Arquivo nao encontrado: $filePath"
    }
}

Write-Host ""
Write-Host "Atualizacao concluida!"
Write-Host "Valores atualizados:"
Write-Host "  FREE: 50 creditos/mes"
Write-Host "  START CREATOR: 800 creditos/mes"
Write-Host "  TURBO MAKER: 1.600 creditos/mes"
Write-Host "  MASTER PRO: 2.400 creditos/mes"
Write-Host ""
Write-Host "IMPORTANTE: Limpe o cache do navegador (Ctrl+F5) para ver as mudancas!"

