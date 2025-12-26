// whisk.js - Módulo para detecção e inpainting via Google Whisk
const { fetch } = require('undici');
const sharp = require('sharp');

class WhiskError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'WhiskError';
    this.code = code;
  }
}

class WhiskClient {
  constructor(cookie) {
    if (!cookie?.trim()) throw new WhiskError('Cookie do Whisk é obrigatório.');
    this.cookie = cookie;
  }

  // Detecta textos na imagem via prompt de detecção
  async detectText(imageBase64) {
    const prompt = 'Detect all text regions in this image. Return only a JSON array like [{"text":"string","x":int,"y":int,"w":int,"h":int}] with bounding boxes. Do not include any explanation.';
    const payload = {
      image: imageBase64,
      prompt,
      output_type: 'json'
    };

    const res = await fetch('https://whisk.google.com/api/detect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.cookie
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new WhiskError(`Detecção falhou: ${txt}`, res.status);
    }

    const data = await res.json();
    if (!data.detections || !Array.isArray(data.detections)) {
      throw new WhiskError('Resposta inválida da detecção.');
    }
    return data.detections;
  }

  // Inpainting: remove ou substitui região via máscara
  async inpaint(imageBase64, maskBase64, prompt = 'remove text, keep background seamless') {
    const payload = {
      image: imageBase64,
      mask: maskBase64,
      prompt,
      output_type: 'base64'
    };

    const res = await fetch('https://whisk.google.com/api/inpaint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.cookie
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new WhiskError(`Inpainting falhou: ${txt}`, res.status);
    }

    const data = await res.json();
    if (!data.image) {
      throw new WhiskError('Imagem não retornada no inpainting.');
    }
    return data.image; // base64
  }
}

module.exports = { WhiskClient, WhiskError };