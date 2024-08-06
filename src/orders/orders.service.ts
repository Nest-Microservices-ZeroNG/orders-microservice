import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  CreateOrderDto,
  OrderPaginationDto,
  UpdateOrderStatusDto,
} from './dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { NATS_SERVICE } from '../config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('OrdersService');

  constructor(@Inject(NATS_SERVICE) private readonly natsClient: ClientProxy) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('PostgreSQL Database connected');
  }

  async create(createOrderDto: CreateOrderDto) {
    try {
      const productIds = createOrderDto.items.map((item) => item.productId);
      const products: any[] = await firstValueFrom(
        this.natsClient.send({ cmd: 'validate_products' }, productIds),
      );

      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find((p) => p.id === orderItem.productId).price;
        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      //? Create Database Transaction
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((oi) => ({
                price: products.find((p) => p.id === oi.productId).price,
                productId: oi.productId,
                quantity: oi.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });
      return {
        ...order,
        OrderItem: order.OrderItem.map((oi) => ({
          ...oi,
          name: products.find((p) => p.id === oi.productId).name,
        })),
      };
    } catch (e) {
      throw new RpcException(e);
    }
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
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });
    if (!order) {
      throw new RpcException({
        message: `Order with id ${id} not found`,
        status: HttpStatus.NOT_FOUND,
      });
    }

    try {
      const productIds = order.OrderItem.map((oi) => oi.productId);
      const products: any[] = await firstValueFrom(
        this.natsClient.send({ cmd: 'validate_products' }, productIds),
      );
      return {
        ...order,
        OrderItem: order.OrderItem.map((oi) => ({
          ...oi,
          name: products.find((p) => p.id === oi.productId).name,
        })),
      };
    } catch (e) {
      throw new RpcException(e);
    }
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
