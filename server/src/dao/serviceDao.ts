import { Types } from "mongoose";
import { Service, IService } from "../models/Service";
import { ServiceTier } from "../types";

export interface CreateServiceDto {
  name: string;
  tier: ServiceTier;
  owningTeam: string;
  runbookLinks?: string[];
  organizationId: string | Types.ObjectId;
}

export class ServiceDao {
  async findById(serviceId: string | Types.ObjectId): Promise<IService | null> {
    return Service.findById(serviceId).exec();
  }

  async findByOrgAndId(
    organizationId: string | Types.ObjectId,
    serviceId: string | Types.ObjectId
  ): Promise<IService | null> {
    return Service.findOne({
      _id: serviceId,
      organizationId,
    }).exec();
  }

  async findByName(
    organizationId: string | Types.ObjectId,
    name: string
  ): Promise<IService | null> {
    return Service.findOne({
      organizationId,
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    }).exec();
  }

  async findServicesByOrg(organizationId: string | Types.ObjectId): Promise<IService[]> {
    return Service.find({ organizationId }).sort({ name: 1 }).exec();
  }

  async create(data: CreateServiceDto): Promise<IService> {
    return Service.create(data);
  }

  async deleteByOrgAndId(
    organizationId: string | Types.ObjectId,
    serviceId: string | Types.ObjectId
  ): Promise<IService | null> {
    return Service.findOneAndDelete({
      _id: serviceId,
      organizationId,
    }).exec();
  }
}

export const serviceDao = new ServiceDao();
export default serviceDao;

