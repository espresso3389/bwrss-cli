export class BwrssError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BwrssError";
  }
}

export class ConfigError extends BwrssError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class BitwardenError extends BwrssError {
  constructor(message: string) {
    super(message);
    this.name = "BitwardenError";
  }
}

export class ParserError extends BwrssError {
  constructor(message: string) {
    super(message);
    this.name = "ParserError";
  }
}
