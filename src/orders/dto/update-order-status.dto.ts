import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { OrderStatusList } from '../enum/order.enum';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @IsString()
  @IsUUID()
  public id: string;

  @IsOptional()
  @IsEnum(OrderStatusList, {
    message: `Valid status are ${OrderStatusList}`,
  })
  public status: OrderStatus;
}
