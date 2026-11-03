import { INSTALL_ACCOUNTS, installAccountsVisible, installPassword } from './src/install.js';
import { get } from './src/db.js';
console.log('installAccountsVisible', installAccountsVisible());
console.log('INSTALL_ACCOUNTS keys', INSTALL_ACCOUNTS.map(a => a.email).join(', '));
const users = get('SELECT id, email, password_hash FROM users');
console.log('users count', users?.length);
for (const u of users || []) console.log('user', u.email, u.password_hash ? u.password_hash.substring(0, 8) + '...' : null);
