# Ya Cloud Calls Router

Центральный диспетчер вызовов для Yandex Cloud функций с поддержкой маршрутизации событий, обработки веб-хуков, очередей сообщений и управления Telegram ботами.

## Описание

`@dieugene/ya-cloud-calls-router` - это универсальный роутер для облачных функций Yandex Cloud, который обеспечивает централизованную обработку различных типов событий:

- 📡 **Внешние JSON запросы** - веб-хуки, API вызовы
- ⏰ **Таймерные события** - запланированные задачи
- 📨 **Сообщения из очередей** - асинхронная обработка
- 🤖 **Telegram боты** - обработка обновлений и веб-хуков
- 🧪 **Тестовые вызовы** - отладка и тестирование

## Установка

```bash
npm install @dieugene/ya-cloud-calls-router
```

## Быстрый старт

```javascript
const router = require('@dieugene/ya-cloud-calls-router');

// Инициализация с обработчиком бота
const botHandler = {
    async process(input, botToken) {
        // Логика обработки бота
        return { success: true };
    },
    
    async process_webhook(input, botToken) {
        // Логика обработки веб-хука
        return { success: true };
    },
    
    // Регистрация обработчиков диспетчера
    reg_dispatcher_handlers({ Timers, Queues, Webs, Admins }) {
        // Регистрация обработчиков таймеров
        Timers.reg(async (input) => {
            console.log('Timer event:', input);
            return true;
        });
        
        // Регистрация обработчиков очередей
        Queues.reg(async (message) => {
            console.log('Queue message:', message);
            return true;
        });
        
        // Регистрация веб-обработчиков
        Webs.reg(async (input) => {
            console.log('Web request:', input);
            return true;
        });
        
        // Регистрация админ-обработчиков
        Admins.reg.json(async (input) => {
            console.log('Admin JSON:', input);
            return { result: 'processed' };
        });
    }
};

// Инициализация роутера
router.init(botHandler);

// Экспорт обработчика для Yandex Cloud
module.exports.handler = router.handler;
```

## API

### Основные методы

#### `router.init(handler)`
Инициализирует роутер с обработчиком бота.

**Параметры:**
- `handler` - объект с методами обработки

#### `router.handler(event, context)`
Основная функция-обработчик для Yandex Cloud Function.

**Возвращает:** Promise с результатом обработки

### Структура обработчика

Обработчик должен реализовывать следующие методы:

```javascript
const handler = {
    // Обязательный метод обработки основных событий
    async process(input, botToken) {
        // input: { action, data: { string, object } }
        // botToken: string (при работе с ботами)
        return result;
    },
    
    // Опциональный метод обработки веб-хуков
    async process_webhook(input, botToken) {
        return result;
    },
    
    // Опциональная регистрация диспетчеров
    reg_dispatcher_handlers({ Timers, Queues, Webs, Admins }) {
        // Регистрация обработчиков
    }
};
```

### Диспетчеры

#### Timers
Обработка событий по таймеру.

```javascript
Timers.reg(async (input) => {
    // Обработка таймерного события
    return true; // или false
});
```

#### Queues
Обработка сообщений из очередей.

```javascript
Queues.reg(async (message) => {
    // message: { domain, body, queue_url }
    return true; // или false
});
```

#### Webs
Обработка веб-запросов и хуков.

```javascript
Webs.reg(async (input) => {
    // Обработка веб-запроса
    return true; // или false
});
```

#### Admins
Обработка тестовых/админских вызовов.

```javascript
// Пустые тестовые вызовы
Admins.reg.empty(async (input) => {
    return { result: 'empty processed' };
});

// Текстовые тестовые вызовы
Admins.reg.text(async (input) => {
    return { result: 'text processed' };
});

// JSON тестовые вызовы
Admins.reg.json(async (input) => {
    return { result: 'json processed' };
});
```

## Переменные окружения

- `BOT_NAME` - имя бота (по умолчанию: 'NO_NAME')
- `TELEGRAM_BOT_TOKEN` - токен Telegram бота
- `QUEUE_URL` - URL очереди сообщений

## Типы событий

Роутер автоматически определяет тип события на основе входящих данных:

- **external.json** - внешние JSON запросы
- **timer.empty** - пустые события таймера
- **timer.text** - текстовые события таймера
- **queue** - сообщения из очереди
- **test.empty** - пустые тестовые события
- **test.text** - текстовые тестовые события
- **test.json** - JSON тестовые события

## Зависимости

- `@dieugene/utils` - утилиты для работы с облаком
- `@dieugene/logger` - система логирования
- `@dieugene/queuer` - работа с очередями сообщений
- `@dieugene/tg-updates-checker` - проверка обновлений Telegram

## Примеры использования

### Простой бот-обработчик

```javascript
const router = require('@dieugene/ya-cloud-calls-router');

const simpleBot = {
    async process(input) {
        const update = input.data.object;
        
        if (update.message) {
            console.log('Получено сообщение:', update.message.text);
            // Логика обработки сообщения
        }
        
        return { success: true };
    }
};

router.init(simpleBot);
module.exports.handler = router.handler;
```

### Расширенный обработчик с диспетчерами

```javascript
const router = require('@dieugene/ya-cloud-calls-router');

const advancedBot = {
    async process(input, botToken) {
        // Основная логика бота
        return await this.handleBotUpdate(input.data.object);
    },
    
    async handleBotUpdate(update) {
        // Детальная обработка обновления
        return { processed: true };
    },
    
    reg_dispatcher_handlers({ Timers, Queues, Webs, Admins }) {
        // Обработка регулярных задач
        Timers.reg(async (input) => {
            console.log('Выполнение планового задания');
            await this.performScheduledTask();
            return true;
        });
        
        // Обработка внешних веб-хуков
        Webs.reg(async (input) => {
            const data = input.data.object;
            if (data.type === 'payment_notification') {
                await this.handlePayment(data);
                return true;
            }
            return false;
        });
        
        // Админские команды
        Admins.reg.json(async (input) => {
            const command = input.data.object.command;
            switch (command) {
                case 'status':
                    return { status: 'running', uptime: process.uptime() };
                case 'restart':
                    return { result: 'restarting...' };
                default:
                    return { error: 'unknown command' };
            }
        });
    }
};

router.init(advancedBot);
module.exports.handler = router.handler;
```

## Лицензия

ISC

## Автор

Eugene Ditkovsky
