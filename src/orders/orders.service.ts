import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateOrderDto,
  OrderPaginationDto,
  UpdateOrderStatusDto,
} from './dto';
import { PrismaClient } from '@prisma/client';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL Database connected');
  }

  create(createOrderDto: CreateOrderDto) {
    return this.order.create({
      data: { ...createOrderDto },
    });
  }

  async findAll(paginationDto: OrderPaginationDto) {
    const { page, limit, status } = paginationDto;
    const total = await this.order.count({
      where: { status },
    });
    const pages = Math.ceil(total / limit);

    return {
      data: await this.order.findMany({
        skip: (page - 1) * limit,
        take: limit,
        where: {
          status,
        },
      }),
      meta: {
        page,
        limit,
        total,
        pages,
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order.findUnique({
      where: { id },
    });
    if (!order) {
      throw new RpcException({
        message: `Order with id ${id} not found`,
        status: HttpStatus.NOT_FOUND,
      });
    }
    return order;
  }

  async changeOrderStatus(updateOrderStatusDto: UpdateOrderStatusDto) {
    const { id, status } = updateOrderStatusDto;
    const orderDb = await this.findOne(id);
    if (orderDb.status === status) return orderDb;
    return this.order.update({
      where: { id },
      data: { status },
    });
  }
}
