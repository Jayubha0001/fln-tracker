export function resetTemporaryPassword(randomPassword, configuredPassword) {
  if (typeof configuredPassword !== 'string' || configuredPassword.length === 0) {
    return { password: randomPassword, mode: 'unique-random' };
  }
  const hasRequiredComplexity = configuredPassword.length >= 8
    && /[A-Z]/.test(configuredPassword)
    && /[a-z]/.test(configuredPassword)
    && /\d/.test(configuredPassword)
    && /[^A-Za-z0-9]/.test(configuredPassword);
  if (!hasRequiredComplexity) {
    throw new Error('ADMIN_TEMPORARY_PASSWORD must contain at least 8 characters with upper/lowercase, a number and a symbol.');
  }
  return { password: configuredPassword, mode: 'shared-configured' };
}
