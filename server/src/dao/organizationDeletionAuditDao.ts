import { Types, ClientSession } from "mongoose";
import {
  OrganizationDeletionAudit,
  IOrganizationDeletionAudit,
} from "../models/OrganizationDeletionAudit";

export interface CreateDeletionAuditInput {
  organizationId: string | Types.ObjectId;
  organizationName: string;
  organizationSlug: string;
  deletedBy: {
    userId: string | Types.ObjectId;
    email: string;
  };
  counts: Record<string, number>;
  totalRecordsDeleted: number;
}

export class OrganizationDeletionAuditDao {
  async create(
    input: CreateDeletionAuditInput,
    session?: ClientSession
  ): Promise<IOrganizationDeletionAudit> {
    const doc = new OrganizationDeletionAudit({
      organizationId: new Types.ObjectId(input.organizationId.toString()),
      organizationName: input.organizationName,
      organizationSlug: input.organizationSlug,
      deletedBy: {
        userId: new Types.ObjectId(input.deletedBy.userId.toString()),
        email: input.deletedBy.email.toLowerCase().trim(),
      },
      counts: input.counts,
      totalRecordsDeleted: input.totalRecordsDeleted,
      timestamp: new Date(),
    });

    if (session) {
      return (await doc.save({ session })) as IOrganizationDeletionAudit;
    }
    return (await doc.save()) as IOrganizationDeletionAudit;
  }

  async findByOrgId(organizationId: string | Types.ObjectId): Promise<IOrganizationDeletionAudit | null> {
    return OrganizationDeletionAudit.findOne({
      organizationId: new Types.ObjectId(organizationId.toString()),
    }).exec();
  }
}

export const organizationDeletionAuditDao = new OrganizationDeletionAuditDao();
export default organizationDeletionAuditDao;

