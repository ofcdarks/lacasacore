const DefaultHeader = {
  "Origin": "https://labs.google",
  "content-type": "application/json",
  "Referer": "https://labs.google/fx/tools/image-fx"
};
const Model = Object.freeze({
  IMAGEN_3: "IMAGEN_3",
  IMAGEN_3_1: "IMAGEN_3_1",
  IMAGEN_3_5: "IMAGEN_3_5"
});
const AspectRatio = Object.freeze({
  SQUARE: "IMAGE_ASPECT_RATIO_SQUARE",
  PORTRAIT: "IMAGE_ASPECT_RATIO_PORTRAIT",
  LANDSCAPE: "IMAGE_ASPECT_RATIO_LANDSCAPE",
  UNSPECIFIED: "IMAGE_ASPECT_RATIO_UNSPECIFIED"
});

class ImageFXError extends Error {
  constructor(message, code) { 
    super(message);
    this.name = "ImageFXError";
    this.code = code; 
  }
}

class AccountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

class Account {
  constructor(cookie) {
    if (!cookie?.trim()) {
      throw new AccountError("O cookie é obrigatório e não pode estar vazio.");
    }
    this.cookie = cookie;
    this.user = null;
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Refreshes the session token if it's missing, expired, or about to expire.
   * Throws an AccountError if session refresh fails.
   */
  async refreshSession() {
    // Refresh if token is expired or will expire within 30 seconds (proactive refresh)
    if (!this.token || !this.tokenExpiry || this.tokenExpiry <= new Date(Date.now() + 30 * 1000)) {
      const sessionResult = await this.fetchSession();
      if (!sessionResult || !sessionResult.access_token || !sessionResult.expires || !sessionResult.user) {
        throw new AccountError("A resposta da sessão não contém os campos esperados: access_token, expires, user.");
      }
      this.user = sessionResult.user;
      this.token = sessionResult.access_token;
      this.tokenExpiry = new Date(sessionResult.expires);
    }
  }

  /**
   * Returns the authentication headers including the session cookie and bearer token.
   * Throws an AccountError if the token is missing.
   */
  getAuthHeaders() {
    if (!this.token) {
      throw new AccountError("Token de autenticação em falta. A atualização da sessão pode ter falhado.");
    }
    return {
      ...DefaultHeader,
      "Cookie": this.cookie,
      "Authorization": "Bearer " + this.token
    };
  }

  /**
   * Fetches the current session data from the ImageFX authentication endpoint.
   * Throws an AccountError for authentication failures or invalid session data.
   */
  async fetchSession() {
    const response = await fetch("https://labs.google/fx/api/auth/session", {
      headers: {
        ...DefaultHeader,
        "Cookie": this.cookie // Use the raw cookie string directly for session endpoint
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new AccountError(`Falha na autenticação (${response.status}). Verifique se os seus cookies são válidos e atualizados.`, response.status);
      }
      throw new AccountError(`Falha na autenticação (${response.status}): ${errorText}.`, response.status);
    }

    const sessionData = await response.json();
    // Validate essential fields in the session response
    if (!sessionData.access_token || !sessionData.expires || !sessionData.user) {
      throw new AccountError(`Resposta de sessão inválida: faltam campos obrigatórios (access_token, expires, user). Dados recebidos: ${JSON.stringify(sessionData)}`);
    }
    return sessionData;
  }
}

/**
 * Represents the payload for a prompt request to the ImageFX API.
 */
class Prompt {
  constructor(args) {
    // Ensure the prompt text is valid before constructing the object
    if (!args.prompt?.trim()) {
      throw new ImageFXError("O texto do prompt é obrigatório e não pode estar vazio.");
    }
    this.seed = args.seed ?? Math.floor(Math.random() * 1000000);
    this.prompt = args.prompt;
    this.numberOfImages = args.numberOfImages ?? 1;
    this.aspectRatio = args.aspectRatio ?? AspectRatio.SQUARE; 
    this.generationModel = args.generationModel ?? Model.IMAGEN_3_5;
  }

  /**
   * Converts the Prompt object to a JSON string suitable for the ImageFX API request body.
   */
  toString() {
    return JSON.stringify({
      "userInput": {
        "candidatesCount": this.numberOfImages,
        "prompts": [this.prompt],
        "seed": this.seed
      },
      "clientContext": {
        "sessionId": `${Date.now()}`, // Unique session ID for client context
        "tool": "IMAGE_FX"
      },
      "modelInput": {
        "modelNameType": this.generationModel
      },
      "aspectRatio": this.aspectRatio
    });
  }
}

/**
 * Represents a single generated image result from the ImageFX API.
 */
class Image {
  constructor(args) {
    // Ensure encodedImage is not empty or null
    if (!args.encodedImage?.trim()) {
      throw new ImageFXError("Dados da imagem codificada são obrigatórios e não podem estar vazios.");
    }
    this.seed = args.seed;
    this.prompt = args.prompt;
    this.model = args.modelNameType;
    this.aspectRatio = args.aspectRatio;
    this.workflowId = args.workflowId;
    this.encodedImage = args.encodedImage;
    this.mediaId = args.mediaGenerationId;
    this.fingerprintId = args.fingerprintLogRecordId;
  }

  /**
   * Returns formatted image data for display or download.
   */
  getImageData() {
    return {
      url: `data:image/png;base64,${this.encodedImage}`,
      prompt: this.prompt,
      mediaId: this.mediaId,
      seed: this.seed
    };
  }
}

/**
 * Main class for interacting with the Google ImageFX API.
 * Handles authentication via cookies and image generation requests.
 */
class ImageFX {
  constructor(cookie) {
    if (!cookie?.trim()) {
      throw new ImageFXError("O cookie é obrigatório e não pode estar vazio.");
    }
    this.account = new Account(cookie);
  }

  /**
   * Generates images based on a given prompt and options.
   *
   * @param {string} promptText The text prompt for image generation.
   * @param {object} options Optional parameters for generation (seed, numberOfImages, aspectRatio, generationModel, retries).
   * @returns {Promise<Array<Image>>} An array of Image objects.
   * @throws {ImageFXError|AccountError} If generation fails due to API issues or authentication.
   */
  async generateImage(promptText, options = {}) {
    if (!promptText?.trim()) {
      throw new ImageFXError("O prompt não pode estar vazio.");
    }

    // Ensure session is fresh before attempting generation
    await this.account.refreshSession();

    const prompt = new Prompt({
      prompt: promptText,
      seed: options.seed,
      numberOfImages: options.numberOfImages,
      aspectRatio: options.aspectRatio,
      generationModel: options.generationModel
    });

    const generatedImagesData = await this.fetchImages(prompt, options.retries || 2);
    return generatedImagesData.map((data) => new Image(data));
  }

  /**
   * Internal method to send the image generation request and handle retries.
   *
   * @param {Prompt} prompt The Prompt object containing generation parameters.
   * @param {number} retry Number of retries remaining.
   * @returns {Promise<Array<object>>} An array of raw image data from the API response.
   * @throws {ImageFXError|AccountError} If generation fails.
   */
  async fetchImages(prompt, retry = 0) {
    try {
      const response = await fetch("https://aisandbox-pa.googleapis.com/v1:runImageFx", {
        method: "POST",
        body: prompt.toString(),
        headers: this.account.getAuthHeaders()
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401 || response.status === 403) {
          // If a token expired between refreshSession and this fetch, this will catch it.
          // It's crucial to throw an AccountError here to avoid retrying with invalid credentials.
          throw new AccountError(`Falha na autenticação (${response.status}). Por favor, verifique se os seus cookies são válidos e atualizados.`, response.status);
        }
        // Specific message for 429 errors from ImageFX
        let specificErrorMessage = `O servidor ImageFX respondeu com um erro (${response.status}): ${errorText}`;
        if (response.status === 429) {
          specificErrorMessage = `O servidor ImageFX atingiu o limite de taxa (429). Por favor, tente novamente mais tarde. Detalhes: ${errorText}`;
        }
        // Pass response.status as code to ImageFXError for detailed debugging
        throw new ImageFXError(specificErrorMessage, response.status);
      }

      const jsonResponse = await response.json();
      const generatedImages = jsonResponse?.imagePanels?.[0]?.generatedImages;

      if (!generatedImages || generatedImages.length === 0) {
        // More specific message if API returns no images but no explicit error structure
        throw new ImageFXError("A API não retornou imagens. O prompt pode ter sido bloqueado, ser muito genérico ou houve um problema temporário com o serviço.");
      }
      return generatedImages;

    } catch (error) {
      // Retry logic for transient errors, but not for explicit authentication failures
      if (retry > 0 && !(error instanceof AccountError)) {
        console.warn(`[ImageFX] Falha ao gerar imagem. Tentando novamente... (${retry} tentativas restantes)`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
        return this.fetchImages(prompt, retry - 1);
      }

      // Re-throw custom errors directly to maintain type and code for upstream handling
      if (error instanceof ImageFXError || error instanceof AccountError) {
        throw error;
      }
      // Catch any other unexpected network or parsing errors
      throw new ImageFXError(`Falha ao comunicar com a API: ${error.message}`);
    }
  }
}

module.exports = {
  ImageFX,
  ImageFXError,
  AccountError,
  Model,
  AspectRatio,
  Account
};