export type LocationRequest = {
  id: string;
  city: string;
  district: string;
  complex: string;
  createdAt: string;
};

export type AdminPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type LoginChallenge = {
  challenge?: string;
  iterations?: number;
  salt?: string;
  error?: string;
};

export type LoginProof = {
  accountHash: string;
  proof: string;
};

export type PendingRequestAction = {
  request: LocationRequest;
  type: "approve" | "reject";
};

export type AdminLocation = {
  city: string;
  district: string;
  complex: string;
};

export type AdminLocationLevel = "city" | "district" | "complex";

export type AdminLocationTarget = AdminLocation & {
  level: AdminLocationLevel;
};
