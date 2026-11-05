// Session storage only: the token is gone once the tab closes.
const TOKEN_KEY = 'adminToken';

export const readAdminToken = (): string => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

export const saveAdminToken = (token: string) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // The token then lasts only as long as this page.
  }
};
