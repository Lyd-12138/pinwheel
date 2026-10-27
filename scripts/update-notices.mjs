import { createNotices } from './notices.mjs';
console.log('Packages documented:', await createNotices('node_modules', 'THIRD-PARTY-NOTICES.md'));
