import { Types } from "mongoose";
import {
  IncidentEmbedding,
  IIncidentEmbedding,
} from "../models/IncidentEmbedding";

export interface CreateOrUpdateEmbeddingInput {
  incidentId: Types.ObjectId | string;
  organizationId: Types.ObjectId | string;
  vector: number[];
  model: string;
  provider: string;
  dim: number;
  textHash: string;
}

export class IncidentEmbeddingDao {
  /**
   * Upsert embedding for an incident (creates new or updates existing).
   */
  async upsert(input: CreateOrUpdateEmbeddingInput): Promise<IIncidentEmbedding> {
    const incidentObjId = new Types.ObjectId(input.incidentId);
    const orgObjId = new Types.ObjectId(input.organizationId);

    const doc = await IncidentEmbedding.findOneAndUpdate(
      { incidentId: incidentObjId },
      {
        incidentId: incidentObjId,
        organizationId: orgObjId,
        vector: input.vector,
        model: input.model,
        provider: input.provider,
        dim: input.dim,
        textHash: input.textHash,
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    ).exec();

    return doc as IIncidentEmbedding;
  }

  /**
   * Find embedding by incident ID.
   */
  async findByIncidentId(
    incidentId: Types.ObjectId | string
  ): Promise<IIncidentEmbedding | null> {
    return IncidentEmbedding.findOne({
      incidentId: new Types.ObjectId(incidentId),
    }).exec();
  }

  /**
   * Delete embedding by incident ID (called when incident is deleted).
   */
  async deleteByIncidentId(
    incidentId: Types.ObjectId | string
  ): Promise<boolean> {
    const result = await IncidentEmbedding.deleteOne({
      incidentId: new Types.ObjectId(incidentId),
    }).exec();
    return (result.deletedCount ?? 0) > 0;
  }

  /**
   * Delete embeddings by multiple incident IDs.
   */
  async deleteManyByIncidentIds(
    incidentIds: (Types.ObjectId | string)[]
  ): Promise<number> {
    const objectIds = incidentIds.map((id) => new Types.ObjectId(id));
    const result = await IncidentEmbedding.deleteMany({
      incidentId: { $in: objectIds },
    }).exec();
    return result.deletedCount ?? 0;
  }

  /**
   * Find all embeddings for an organization, optionally excluding a specific incident.
   */
  async findForOrg(
    organizationId: Types.ObjectId | string,
    options?: { excludeIncidentId?: Types.ObjectId | string; limit?: number }
  ): Promise<IIncidentEmbedding[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (options?.excludeIncidentId) {
      query.incidentId = {
        $ne: new Types.ObjectId(options.excludeIncidentId),
      };
    }

    let cursor = IncidentEmbedding.find(query);
    if (options?.limit && options.limit > 0) {
      cursor = cursor.limit(options.limit);
    }

    return cursor.exec();
  }

  /**
   * Count total embeddings for an organization.
   */
  async countForOrg(organizationId: Types.ObjectId | string): Promise<number> {
    return IncidentEmbedding.countDocuments({
      organizationId: new Types.ObjectId(organizationId),
    }).exec();
  }
}

export const incidentEmbeddingDao = new IncidentEmbeddingDao();
export default incidentEmbeddingDao;

