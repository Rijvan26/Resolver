import { Types } from "mongoose";
import { AiSuggestion, IAiSuggestion } from "../models/AiSuggestion";
import { AiSuggestionType, AiUserDecision } from "../types";

export interface CreateAiSuggestionDto {
  incidentId: string | Types.ObjectId;
  organizationId: string | Types.ObjectId;
  type: AiSuggestionType;
  inputHash: string;
  output: Record<string, unknown>;
  model: string;
  provider: string;
  latencyMs?: number;
  status?: "ready" | "failed" | "unavailable";
}

export class AiSuggestionDao {
  async create(data: CreateAiSuggestionDto): Promise<IAiSuggestion> {
    return AiSuggestion.create(data);
  }

  async findById(id: string | Types.ObjectId): Promise<IAiSuggestion | null> {
    return AiSuggestion.findById(id).populate("decidedBy", "name email role").exec();
  }

  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    id: string | Types.ObjectId
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({
      _id: id,
      organizationId,
    })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async findByInputHash(inputHash: string): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({ inputHash })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findLatestByIncidentAndType(
    incidentId: string | Types.ObjectId,
    type: AiSuggestionType
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findOne({ incidentId, type })
      .sort({ createdAt: -1 })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async findByIncident(
    incidentId: string | Types.ObjectId,
    type?: AiSuggestionType
  ): Promise<IAiSuggestion[]> {
    const query: Record<string, unknown> = { incidentId };
    if (type) query.type = type;
    return AiSuggestion.find(query)
      .sort({ createdAt: -1 })
      .populate("decidedBy", "name email role")
      .exec();
  }

  async updateDecision(
    id: string | Types.ObjectId,
    decision: AiUserDecision,
    decidedBy: string | Types.ObjectId,
    editedOutput?: Record<string, unknown> | null
  ): Promise<IAiSuggestion | null> {
    return AiSuggestion.findByIdAndUpdate(
      id,
      {
        $set: {
          userDecision: decision,
          decidedBy,
          decidedAt: new Date(),
          ...(editedOutput !== undefined ? { editedOutput } : {}),
        },
      },
      { new: true }
    ).exec();
  }
}

export const aiSuggestionDao = new AiSuggestionDao();
export default aiSuggestionDao;

