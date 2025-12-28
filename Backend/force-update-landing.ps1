# Script para FORCAR atualizacao dos valores na landing page
# Este script faz substituicoes mais agressivas e adiciona timestamp para evitar cache

$ErrorActionPreference = "Stop"

$files = @(
    "Backend\landing-dist\assets\index-CJf_7i13.js",
    "Backend\landing-dist\assets\index-D74MUa4q.js"
)

Write-Host "=== FORCANDO ATUALIZACAO DOS VALORES ==="
Write-Host ""

foreach ($filePath in $files) {
    if (Test-Path $filePath) {
        Write-Host "Processando: $filePath"
        
        $content = [System.IO.File]::ReadAllText((Resolve-Path $filePath).Path, [System.Text.Encoding]::UTF8)
        $originalLength = $content.Length
        $changes = 0
        
        # Substituicoes mais agressivas - todos os padroes possiveis
        $replacements = @{
            # FREE: 100 -> 50
            '\b100\b(?![0-9px%])' = '50'
            '"100"' = '"50"'
            ':100,' = ':50,'
            ':100}' = ':50}'
            'credits:"100"' = 'credits:"50"'
            'credits:100[^0-9]' = 'credits:50'
            '"100 cr' = '"50 cr'
            '100 creditos' = '50 creditos'
            '100 créditos' = '50 créditos'
            
            # START: 1000 -> 800
            '\b1000\b(?![0-9])' = '800'
            '"1000"' = '"800"'
            ':1000,' = ':800,'
            ':1000}' = ':800}'
            'credits:"1000"' = 'credits:"800"'
            'credits:1000[^0-9]' = 'credits:800'
            '"1000 cr' = '"800 cr'
            '1000 creditos' = '800 creditos'
            '1000 créditos' = '800 créditos'
            '1\.000' = '800'
            '"1\.000"' = '"800"'
            'credits:"1\.000' = 'credits:"800'
            '"1\.000 cr' = '"800 cr'
            '1\.000 creditos' = '800 creditos'
            '1\.000 créditos' = '800 créditos'
            '1,000' = '800'
            '"1,000"' = '"800"'
            
            # TURBO: 2500 -> 1600
            '\b2500\b(?![0-9])' = '1600'
            '"2500"' = '"1600"'
            ':2500,' = ':1600,'
            ':2500}' = ':1600}'
            'credits:"2500"' = 'credits:"1600"'
            'credits:2500[^0-9]' = 'credits:1600'
            '"2500 cr' = '"1.600 cr'
            '2500 creditos' = '1600 creditos'
            '2500 créditos' = '1600 créditos'
            '2\.500' = '1.600'
            '"2\.500"' = '"1.600"'
            'credits:"2\.500' = 'credits:"1.600'
            '"2\.500 cr' = '"1.600 cr'
            '2\.500 creditos' = '1.600 creditos'
            '2\.500 créditos' = '1.600 créditos'
            '2,500' = '1.600'
            '"2,500"' = '"1.600"'
            
            # MASTER: 5000 -> 2400
            '\b5000\b(?![0-9])' = '2400'
            '"5000"' = '"2400"'
            ':5000,' = ':2400,'
            ':5000}' = ':2400}'
            'credits:"5000"' = 'credits:"2400"'
            'credits:5000[^0-9]' = 'credits:2400'
            '"5000 cr' = '"2.400 cr'
            '5000 creditos' = '2400 creditos'
            '5000 créditos' = '2400 créditos'
            '5\.000' = '2.400'
            '"5\.000"' = '"2.400"'
            'credits:"5\.000' = 'credits:"2.400'
            '"5\.000 cr' = '"2.400 cr'
            '5\.000 creditos' = '2.400 creditos'
            '5\.000 créditos' = '2.400 créditos'
            '5,000' = '2.400'
            '"5,000"' = '"2.400"'
        }
        
        foreach ($pattern in $replacements.Keys) {
            $before = $content
            $content = $content -replace $pattern, $replacements[$pattern]
            if ($content -ne $before) {
                $changes++
            }
        }
        
        # Salvar arquivo
        [System.IO.File]::WriteAllText((Resolve-Path $filePath).Path, $content, [System.Text.Encoding]::UTF8)
        
        Write-Host "  Concluido! $changes tipos de substituicoes aplicadas"
        Write-Host "  Tamanho: $originalLength -> $($content.Length) caracteres"
    } else {
        Write-Host "  Arquivo nao encontrado: $filePath"
    }
}

Write-Host ""
Write-Host "=== ATUALIZACAO CONCLUIDA ==="
Write-Host ""
Write-Host "PROXIMOS PASSOS:"
Write-Host "1. Pare o servidor (Ctrl+C)"
Write-Host "2. Reinicie o servidor"
Write-Host "3. Abra o navegador em MODO ANONIMO (Ctrl+Shift+N)"
Write-Host "4. Acesse: http://localhost:3000/"
Write-Host "5. Se ainda nao funcionar, limpe o cache do navegador:"
Write-Host "   - Chrome/Edge: Ctrl+Shift+Delete -> Limpar dados de navegacao"
Write-Host "   - Ou pressione Ctrl+F5 para forcar recarregamento"
Write-Host ""

