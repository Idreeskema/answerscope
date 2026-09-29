export interface JwtPayload {
  sub: string; // userId
  email: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string | null;
}
