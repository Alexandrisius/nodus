import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../core/database/database.module.js';
import { HomeController } from './home.controller.js';
import { HomeService } from './home.service.js';

/** Витрина Главной (#100): читающий агрегат поверх справочника сотрудников. */
@Module({
  imports: [DatabaseModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
