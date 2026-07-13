/**
 * Password hashing and verification.
 *
 * verifyPassword() used to compare storedHash === password unconditionally,
 * before checking whether storedHash was even in legacy plaintext format.
 * That meant typing the literal stored hash string (e.g. leaked via a pushed
 * backup, or the SQL dump) as the "password" authenticated as that user.
 *
 * Runs under plain node: no DOM, no database, no Electron.
 */

const { hashPassword, verifyPassword } = require('../database/auth');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log('  ✓', message); }
    else { failed++; console.error('  ✗', message); }
}

console.log('\nAuth (hashPassword / verifyPassword) Test');
console.log('==========================================\n');

console.log('scrypt hashes:');
{
    const hash = hashPassword('admin');
    assert(hash.startsWith('scrypt:'), 'hashPassword produces the scrypt: prefix');
    assert(hash.split(':').length === 3, 'the hash has exactly three colon-separated parts');

    assert(verifyPassword('admin', hash) === true, 'the correct password verifies');
    assert(verifyPassword('wrong', hash) === false, 'an incorrect password is rejected');
    assert(verifyPassword('', hash) === false, 'an empty password is rejected');

    // Two hashes of the same password must differ (random salt) but both verify.
    const hash2 = hashPassword('admin');
    assert(hash !== hash2, 'hashing the same password twice produces different hashes (random salt)');
    assert(verifyPassword('admin', hash2) === true, 'the second hash still verifies the same password');
}

console.log('\nthe fixed auth-bypass — the regression this test exists for:');
{
    const hash = hashPassword('admin');
    // This is the exact exploit: type the stored hash string itself as the password.
    assert(verifyPassword(hash, hash) === false, 'the stored hash string is NOT accepted as a valid password');
}

console.log('\nlegacy plaintext passwords (pre-scrypt installs):');
{
    const legacyHash = 'admin'; // ما قبل الترقية: كلمة المرور محفوظة كنص عادي
    assert(verifyPassword('admin', legacyHash) === true, 'a legacy plaintext password still verifies');
    assert(verifyPassword('wrong', legacyHash) === false, 'a wrong password against a legacy hash is rejected');
    // A legacy value that happens to start with "scrypt:" but isn't a real
    // triplet must not be treated as valid scrypt format.
    assert(verifyPassword('scrypt:notreal', 'scrypt:notreal') === false,
        'a malformed value merely prefixed with scrypt: is not treated as a valid hash');
}

console.log('\nedge cases:');
{
    assert(verifyPassword('anything', null) === false, 'a null stored hash never verifies');
    assert(verifyPassword('anything', undefined) === false, 'an undefined stored hash never verifies');
    assert(verifyPassword('anything', '') === false, 'an empty stored hash never verifies');
}

console.log('\n---------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('---------------------------\n');

process.exit(failed > 0 ? 1 : 0);
