# Script para atualizar valores de creditos na landing page
$files = @("Backend\landing-dist\assets\index-CJf_7i13.js", "Backend\landing-dist\assets\index-D74MUa4q.js")

foreach ($filePath in $files) {
    if (Test-Path $filePath) {
        Write-Host "Processando: $filePath"
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Substituicoes especificas
        $content = $content -replace '100 creditos/mes', '50 creditos/mes'
        $content = $content -replace '100 creditos', '50 creditos'
        $content = $content -replace '"100"', '"50"'
        
        $content = $content -replace '1000 creditos/mes', '800 creditos/mes'
        $content = $content -replace '1\.000 creditos/mes', '800 creditos/mes'
        $content = $content -replace '1,000 creditos/mes', '800 creditos/mes'
        $content = $content -replace '"1000"', '"800"'
        
        $content = $content -replace '2500 creditos/mes', '1.600 creditos/mes'
        $content = $content -replace '2\.500 creditos/mes', '1.600 creditos/mes'
        $content = $content -replace '2,500 creditos/mes', '1.600 creditos/mes'
        $content = $content -replace '"2500"', '"1600"'
        
        $content = $content -replace '5000 creditos/mes', '2.400 creditos/mes'
        $content = $content -replace '5\.000 creditos/mes', '2.400 creditos/mes'
        $content = $content -replace '5,000 creditos/mes', '2.400 creditos/mes'
        $content = $content -replace '"5000"', '"2400"'
        
        Set-Content $filePath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "  Arquivo atualizado: $filePath"
    } else {
        Write-Host "  Arquivo nao encontrado: $filePath"
    }
}

Write-Host ""
Write-Host "Concluido! Valores atualizados:"
Write-Host "  - FREE: 50 creditos/mes"
Write-Host "  - START CREATOR: 800 creditos/mes"
Write-Host "  - TURBO MAKER: 1.600 creditos/mes"
Write-Host "  - MASTER PRO: 2.400 creditos/mes"
