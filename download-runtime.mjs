// Electron's supported installer selects and verifies the current platform runtime.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
require('electron/install.js');
