// Register custom ESM loader hooks
import { register } from 'node:module';
register('./test-loader-hooks.mjs', import.meta.url);
