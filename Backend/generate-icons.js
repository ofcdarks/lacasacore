// Script para gerar ícones PWA a partir do favicon.svg
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'icons');
const faviconPath = path.join(__dirname, 'favicon.svg');

// Criar diretório de ícones se não existir
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
    console.log('✅ Diretório icons criado');
}

// Função para gerar ícone PNG a partir do SVG
async function generateIcon(size) {
    try {
        const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
        
        // Reduzir padding ao mínimo para logo ocupar quase todo o espaço
        // Para ícones grandes (192+), usar apenas 2% de padding
        // Para médios (128+), usar 3%
        // Para pequenos, usar 5% para não cortar
        const paddingPercent = size >= 192 ? 0.02 : (size >= 128 ? 0.03 : 0.05);
        const logoSize = Math.floor(size * (1 - paddingPercent * 2));
        
        await sharp(faviconPath)
            .resize(logoSize, logoSize, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .extend({
                top: Math.floor(size * paddingPercent),
                bottom: Math.floor(size * paddingPercent),
                left: Math.floor(size * paddingPercent),
                right: Math.floor(size * paddingPercent),
                background: { r: 0, g: 0, b: 0, alpha: 1 }
            })
            .resize(size, size)
            .png({ quality: 100, compressionLevel: 9 })
            .toFile(outputPath);
        
        console.log(`✅ Ícone ${size}x${size} gerado: ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao gerar ícone ${size}x${size}:`, error.message);
        return false;
    }
}

// Gerar todos os ícones
async function generateAllIcons() {
    console.log('🎨 Gerando ícones PWA...\n');
    
    if (!fs.existsSync(faviconPath)) {
        console.error('❌ favicon.svg não encontrado!');
        process.exit(1);
    }
    
    const results = await Promise.all(iconSizes.map(size => generateIcon(size)));
    const successCount = results.filter(r => r).length;
    
    console.log(`\n✨ Processo concluído! ${successCount}/${iconSizes.length} ícones gerados.`);
    
    if (successCount === iconSizes.length) {
        console.log('🎉 Todos os ícones foram gerados com sucesso!');
    } else {
        console.log('⚠️  Alguns ícones não foram gerados. Verifique os erros acima.');
    }
}

// Executar
generateAllIcons().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
});

