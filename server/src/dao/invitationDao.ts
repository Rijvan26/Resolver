import { ClientSession, Types } from "mongoose";
import { Invitation, IInvitation } from "../models/Invitation";
import { INVITATION_STATUS, InvitationStatus, Role } from "../types";

export interface CreateInvitationInput {
  organizationId: Types.ObjectId | string;
  email: string;
  role: Role;
  inviterId: Types.ObjectId | string;
  tokenHash: string;
  expiresAt: Date;
  status?: InvitationStatus;
}

export class InvitationDao {
  /**
   * Create a new invitation.
   */
  async create(data: CreateInvitationInput, session?: ClientSession): Promise<IInvitation> {
    const invitation = new Invitation({
      ...data,
      email: data.email.toLowerCase().trim(),
    });
    return await invitation.save({ session });
  }

  /**
   * Find an invitation by ID.
   */
  async findById(id: string | Types.ObjectId): Promise<IInvitation | null> {
    return await Invitation.findById(id).exec();
  }

  /**
   * Find an invitation by its hashed token.
   */
  async findByTokenHash(tokenHash: string): Promise<IInvitation | null> {
    return await Invitation.findOne({ tokenHash }).exec();
  }

  /**
   * Find an existing pending invitation for an email within an organization.
   */
  async findPendingByOrgAndEmail(
    organizationId: string | Types.ObjectId,
    email: string
  ): Promise<IInvitation | null> {
    return await Invitation.findOne({
      organizationId,
      email: email.toLowerCase().trim(),
      status: INVITATION_STATUS.PENDING,
      expiresAt: { $gt: new Date() },
    }).exec();
  }

  /**
   * List all invitations for an organization, optionally filtered by status.
   */
  async findByOrg(
    organizationId: string | Types.ObjectId,
    status?: InvitationStatus
  ): Promise<IInvitation[]> {
    const query: Record<string, unknown> = { organizationId };
    if (status) {
      query.status = status;
    }
    return await Invitation.find(query).sort({ createdAt: -1 }).populate("inviterId", "name email").exec();
  }

  /**
   * Atomically mark an invitation as ACCEPTED if it is currently PENDING and not expired.
   * This guarantees safe concurrent invitation acceptance.
   */
  async acceptInvitation(
    id: string | Types.ObjectId,
    session?: ClientSession
  ): Promise<IInvitation | null> {
    return await Invitation.findOneAndUpdate(
      {
        _id: id,
        status: INVITATION_STATUS.PENDING,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: INVITATION_STATUS.ACCEPTED,
          acceptedAt: new Date(),
        },
      },
      { returnDocument: "after", session }
    ).exec();
  }

  /**
   * Revoke an active pending invitation.
   */
  async revokeInvitation(
    id: string | Types.ObjectId,
    organizationId: string | Types.ObjectId
  ): Promise<IInvitation | null> {
    return await Invitation.findOneAndUpdate(
      {
        _id: id,
        organizationId,
        status: INVITATION_STATUS.PENDING,
      },
      {
        $set: {
          status: INVITATION_STATUS.REVOKED,
        },
      },
      { returnDocument: "after" }
    ).exec();
  }
}

export const invitationDao = new InvitationDao();
export default invitationDao;
