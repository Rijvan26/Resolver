import { ClientSession, Types } from "mongoose";
import { RefreshToken, IRefreshToken } from "../models/RefreshToken";

export interface CreateRefreshTokenInput {
  userId: Types.ObjectId | string;
  organizationId: Types.ObjectId | string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
}

export class RefreshTokenDao {
  /**
   * Store a hashed refresh token session with family tracking.
   */
  async create(data: CreateRefreshTokenInput, session?: ClientSession): Promise<IRefreshToken> {
    const token = new RefreshToken(data);
    return await token.save({ session });
  }

  /**
   * Find a refresh token by its SHA-256 hash.
   */
  async findByTokenHash(tokenHash: string): Promise<IRefreshToken | null> {
    return await RefreshToken.findOne({ tokenHash }).exec();
  }

  /**
   * Mark a specific refresh token as revoked.
   */
  async revokeById(id: string | Types.ObjectId): Promise<IRefreshToken | null> {
    return await RefreshToken.findByIdAndUpdate(
      id,
      { $set: { isRevoked: true } },
      { returnDocument: "after" }
    ).exec();
  }

  /**
   * Revoke all refresh tokens in a family (triggered when reuse of a revoked token is detected).
   */
  async revokeFamily(family: string): Promise<number> {
    const result = await RefreshToken.updateMany(
      { family, isRevoked: false },
      { $set: { isRevoked: true } }
    ).exec();
    return result.modifiedCount;
  }

  /**
   * Revoke all refresh tokens for a user (e.g., password reset or full logout).
   */
  async revokeAllForUser(userId: string | Types.ObjectId): Promise<number> {
    const result = await RefreshToken.updateMany(
      { userId, isRevoked: false },
      { $set: { isRevoked: true } }
    ).exec();
    return result.modifiedCount;
  }
}

export const refreshTokenDao = new RefreshTokenDao();
export default refreshTokenDao;
