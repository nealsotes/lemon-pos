export enum UserRole {
  Owner = 1,
  Employee = 2,
  Admin = 3
}

export interface User {
  id: string;
  username: string;
  role: UserRole | string | number; // Can be enum, string, or number depending on source
  token?: string;
  expiresAt?: Date;
}

export interface LoginResponse {
  token: string;
  username: string;
  role: UserRole | string | number; // Backend may send as enum number, string ("owner"/"employee"), or camelCase string
  expiresAt: string;
}





