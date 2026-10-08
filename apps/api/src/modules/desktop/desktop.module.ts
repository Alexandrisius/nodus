import { Module } from '@nestjs/common';

import { DesktopConfigController } from './desktop-config.controller.js';

/** Десктоп-оболочка (M17/#254): серверная сторона тонкого клиента. */
@Module({
  controllers: [DesktopConfigController],
})
export class DesktopModule {}
