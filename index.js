const I = require("@dieugene/utils");
const logger_init = require("@dieugene/logger");
const queuer = require("@dieugene/queuer")();
const tg_checker = require("@dieugene/tg-updates-checker");

let bot_module,
    domain = process.env.BOT_NAME || 'NO_NAME',
    logger = logger_init(domain);

function init(handler) {
    bot_module = handler;
    // todo - еще одна деталь работы облака. Если не очищать, то обработчики регаются повторно
    [ Timers, Queues, Webs, Admins ].forEach(m => m.init());
    /*
    Регистрация обработчиков для диспетчера.
    Если в модуле экспортирована функция "reg_dispatcher_handlers", она вызывается, и туда передаются модули
    диспетчера: Timers (обработчик вызова по таймеру), Queues (обработчик вызова из очередей),
    Webs (обработчик вызова из веба или веб-хуков), Admins (вызов из тестовой среды).
    Каждый такой модуль имеет функцию reg(handler), например, Timers.reg(handler),
    где требуется передать модулю обработчик вызова по таймеру.
    Обработчики возвращают boolean или boolean-like - чтобы подтвердить, что обработка проведена.
    Пример - med-admin-bot
     */
    if (typeof bot_module.reg_dispatcher_handlers === 'function') {
        I.log('reg_dispatcher_handlers are invoked');
        bot_module.reg_dispatcher_handlers({ Timers, Queues, Webs, Admins })
    }
}

module.exports.init = init;

/**
 Бот-диспетчер
 */
async function handler (event, context) {
    console.log("HQ STARTED");
    let result = {};
    try {
        let input = I.cloud.defineRequest(event, context);
        console.log("HQ STARTED :: ACTION :: ", input.action, ' :: DATA :: ', JSON.stringify(input.data));

        switch (input.action) {
           
            /* MAIN HANDLER  Use input.data.object */
            case I.cloud.events.external.json: // May be webhook setting or webhook call, or API call
                I.log('* MAIN HANDLER INVOKING *');
                if (context._data.params && context._data.params.bot_id) {
                    console.log('BOT DISPATCHER :: HANDLER :: INITIAL BOT REQUEST :: ', input.data.string);
                    result = await Bots.process(input, context._data.params.bot_id);
                }
                /* Данное условие означает, что функция инициирована обработчиком
                очередей main-queue-handler через http, т.е. это тоже внешний вызов с JSON, но в теле
                запроса присутствует свойство bot_token */
                else if (input.data.object.bot_token){
                    console.log('BOT DISPATCHER :: HANDLER :: SECONDARY BOT REQUEST :: ', input.data.string);
                    result = await Bots.process(input, input.data.object.bot_token);// bots handler
                }
                else
                    result = await Webs.process(input); // webhooks handler
                break;

            /* BY TIMER INVOKING :: MAIN */
            case I.cloud.events.timer.empty: // Invoked by timer to refresh webhook
                I.log('* BY TIMER INVOKING * EMPTY');
                result = await Timers.process(input);
                break;

            /* BY TIMER INVOKING :: WITH TEXT Use input.data.string */
            case I.cloud.events.timer.text: // Invoked by timer with text data
                I.log('* BY TIMER INVOKING * TEXT');
                result = await Timers.process(input);
                break;

            /* BY QUEUE INVOKING Use input.data.object.messagesData[]*/
            case I.cloud.events.queue: // Tasks from queue
                I.log('* BY QUEUE INVOKING *');
                result = await Queues.process(input);
                break;

            /* BY TEST INVOKING */
            case I.cloud.events.test.empty: // For some testing
                I.log('* BY TEST INVOKING * EMPTY');
                result = await Admins.process(input);
                break;

            /* BY TEST INVOKING Use input.data.string */
            case I.cloud.events.test.text: // For some testing
                I.log('* BY TEST INVOKING * TEXT');
                result = await Admins.process.text(input);
                // result = await Bots.setWebHook(input.data.string);
                break;

            /* BY TEST INVOKING Use input.data.object */
            case I.cloud.events.test.json: // For some testing
                I.log('* BY TEST INVOKING * JSON');
                result = await Admins.process.json(input);
                break;    
        }

        console.log(':: =============== :: ');
        console.log(':: FUNCTION RESULT :: ', JSON.stringify(result));
        console.log(':: =============== :: ');
    } catch (e) {
        logger.critical('FATAL ERROR', {message: e.message, stack: e.stack});
        console.error(domain + " :: FATAL ERROR :: ", e.message);
        console.error(domain + " :: FATAL ERROR :: STACK :: ", e.stack);
        result = e;
    } 
    return {
        statusCode: 200,
        body: result
    };
}

module.exports.handler = handler;

let Bots = (function () {

    async function processBots(input) {
        let botToken = process.env.TELEGRAM_BOT_TOKEN,
            is_webhook = !!input.data.object.is_webhook;
        if (is_webhook) console.log('⏹ bot dispatcher :: got webhook');
        if (!input.data.object.from_queue && !is_webhook) {
            let updates_count = await tg_checker.get_updates_count(botToken, input.data.object.update_id);
            if (updates_count > 1)
                return logger.critical('GOT PENDING UPDATE', {
                    botToken, data: input.data.object});
        }

        if (!!bot_module) return (is_webhook && (typeof bot_module.process_webhook === 'function'))
            ? await bot_module.process_webhook(input, botToken) // see career-dialog-bot
            : await bot_module.process(input);
        logger.critical('NO HANDLER MODULE', domain, input);
        return {error: 'NO HANDLER MODULE :: DOMAIN :: ' + domain}
    }

    /**
     *
     * @param input {action, token, data: {string, object: {messagesData: [{domain, body, queue_url}]}}}
     * @returns {Promise<Array>}
     */
    async function processFromQueue(input) {
        let msgList = input.data.object.messagesData,
            result = [];
        for (let i = 0; i < msgList.length; i++) {
            let data = msgList[i].body,
                botToken = data.bot_token,
                botInput = {...input},
                bot = bot_module;
            botInput.data = {
                string: JSON.stringify(data),
                object: data
            };
            //console.log('QUEUE :: MESSAGE :: ', {data, botInput});
            if (!!bot) result.push(await bot.process(botInput, botToken));
            else {
                logger.critical('NO SUCH BOT FROM QUEUE', botToken, input);
                result.push({error: 'NO SUCH BOT :: ' + botToken});
            }
        }
        return result;
    }

    processBots.fromQueue = processFromQueue;

    return { process: processBots }
})();

let Queues = (function () {

    let handlers = [];

    function init() {
        handlers = [];
    }

    function reg_handler(handler = o => o) {
        handlers.push(handler);
    }

    async function processQueuesForBots(input) {
        console.log('GOT QUEUE ELEMENT :: INPUT :: ', JSON.stringify(input));
        let is_queue_element_correct = await queuer.ensureQueueItem(input, process.env.QUEUE_URL);
        if (!is_queue_element_correct)
            return logger.critical('GOT WRONG QUEUE INPUT', {input, value: process.env.QUEUE_URL});
        return await Bots.process.fromQueue(input);
    }

    async function processQueues(input) {
        let messagesData = input.data.object.messagesData, botMessages = [];
        for (let message of messagesData) {
            let result = false;
            for (let handler of handlers) {
                if (typeof handler === 'function') {
                    try {
                        let is_processed = await handler(message);
                        if (is_processed) result = true;
                    } catch (e) {
                        I.log_error(e, handler.name)
                    }
                }
            }
            if (!result) botMessages.push(message)
        }

        /*
        Вставлено с учетом существующей конфигурации работы с ботами. Но в целом нужно переносить это как обработчик
         */
        if (!I.arr.isEmpty(botMessages)) {
            input.data.object.messagesData = botMessages;
            return await processQueuesForBots(input);
        }
        return true;
    }

    return {process: processQueues, reg: reg_handler, init}
})();

let Webs = (function () {

    let handlers = [];

    function init() {
        handlers = [];
    }

    function reg_handler(handler = o => o) {
        handlers.push(handler);
    }

    async function processWebs(input) {
        let result = false;
        for (let handler of handlers) {
            if (typeof handler === 'function') {
                try {
                    let is_processed = await handler(input);
                    if (is_processed) result = true;
                } catch (e) {
                    I.log_error(e, handler.name)
                }
            }
        }
        return result;
    }

    return {process: processWebs, reg: reg_handler, init}
})();

let Timers = (function () {

    let handlers = [];

    function init() {
        handlers = [];
    }

    function reg_handler(handler = o => o) {
        handlers.push(handler);
    }

    async function processTimers(input) {
        let result = false;
        for (let handler of handlers) {
            if (typeof handler === 'function') {
                try {
                    let is_processed = await handler(input);
                    if (is_processed) result = true;
                } catch (e) {
                    I.log_error(e, handler.name)
                }
            }
        }
        return result;
    }

    return {process: processTimers, reg: reg_handler, init}
})();

let Admins = (function () {

    const handlers_map = new Map();

    function init() {
        handlers_map.set('empty', []);
        handlers_map.set('text', []);
        handlers_map.set('json', []);
    }

    init();

    function reg(handler = o => o, id = 'empty') {
        handlers_map.get(id).push(handler);
    }

    reg.empty = handler => reg(handler, 'empty');
    reg.text = handler => reg(handler, 'text');
    reg.json = handler => reg(handler, 'json');

    async function processTests(input, id = 'empty') {
        I.log('ADMIN PROCESSING IS INVOKED', 'id=', id, JSON.stringify(input));
        let result = [], handlers = handlers_map.get(id);
        for (let handler of handlers) {
            if (typeof handler === 'function') {
                try {
                    let process_result = await handler(input);
                    if (process_result) result.push(process_result);
                } catch (e) {
                    I.log_error(e, handler.name)
                }
            }
        }
        return result;
    }

    processTests.empty = async input => await processTests(input, 'empty');
    processTests.text = async input => await processTests(input, 'text');
    processTests.json = async input => await processTests(input, 'json');

    return {process: processTests, reg, init}

})();
