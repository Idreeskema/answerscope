import * as dotenv from 'dotenv';

/**
 * Loaded as the very first import in main.ts, before AppModule (and with it
 * @nestjs/config's own ConfigModule.forRoot()) is required. dotenv's config()
 * does NOT overwrite variables that already exist in process.env by
 * default, so without this, a pre-existing OS/user-level environment
 * variable (e.g. OPENAI_API_KEY=ollama, commonly set by local-LLM tooling)
 * would silently shadow this project's own apps/api/.env value. override:
 * true makes this project's .env win for this process only - it never
 * touches the actual OS environment variable.
 */
dotenv.config({ override: true });
