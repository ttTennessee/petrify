// ─── 领域类型 ───
export type Gender = "male" | "female" | "other";

export type BaseUser = {
  name: string;
  gender: Gender;
  email: string;
  phone: string;
};

export type User = BaseUser & {
  id: string;
  createdAt: number;
  updatedAt: number;
};
