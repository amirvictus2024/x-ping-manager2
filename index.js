const { Telegraf, Markup, session } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');

// تنظیمات اولیه
const BOT_TOKEN = '8069263840:AAF2JTFJl6cfo7z1rU_CegYnCNJH6bLXcg0'; // توکن ربات
const ADMIN_ID = 6712954701; // آی‌دی ادمین
const DATA_FILE = 'bot_data.json';

// ساختار داده‌های ربات
let botData = {
    scheduledMessages: [],
    welcomeMessages: {},
    channels: [],
    delayedMessages: []
};

// بارگذاری اطلاعات از فایل
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            botData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('اطلاعات با موفقیت بارگذاری شد.');
        }
    } catch (error) {
        console.error('خطا در بارگذاری اطلاعات:', error);
    }
}

// ذخیره اطلاعات به فایل
function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(botData, null, 2), 'utf8');
        console.log('اطلاعات ذخیره شد.');
    } catch (error) {
        console.error('خطا در ذخیره اطلاعات:', error);
    }
}

// بررسی ادمین بودن کاربر
function isAdmin(ctx) {
    return ctx.from && ctx.from.id === ADMIN_ID;
}

const bot = new Telegraf(BOT_TOKEN);

// استفاده از میدلور session با تنظیمات مناسب
bot.use(session({
    defaultSession: () => ({})
}));

// مدیریت خطاها
bot.catch((err, ctx) => {
    console.error('خطای ربات:', err);
    ctx.reply(`خطایی رخ داد: ${err.message}`).catch(e => console.error('خطا در ارسال پیام خطا:', e));
});

// پنل مدیریت اصلی (چیدمان ۲ ستونه)
function showAdminPanel(ctx) {
    return ctx.reply('🖥 پنل مدیریت:', Markup.inlineKeyboard([
        [
            Markup.button.callback('📝 پیام', 'send_message'),
            Markup.button.callback('⏱ زمانبندی', 'schedule_message')
        ],
        [
            Markup.button.callback('⏲ تأخیر', 'delay_message'),
            Markup.button.callback('📊 نظرسنجی', 'create_poll')
        ],
        [
            Markup.button.callback('👋 خوشامد', 'set_welcome'),
            Markup.button.callback('👥 اعضا', 'get_members')
        ],
        [
            Markup.button.callback('📺 کانال‌ها', 'manage_channels'),
            Markup.button.callback('🔄 پیام‌ها', 'manage_messages')
        ]
    ]));
}

// محدودسازی دسترسی (برای callbackها و پیام‌ها)
bot.use((ctx, next) => {
    // بررسی اینکه آیا یک کالبک یا پیام است و فقط برای غیر ادمین‌ها محدودیت اعمال شود
    if ((ctx.callbackQuery || ctx.updateType === 'message') && !isAdmin(ctx)) {
        return ctx.reply('⛔️ شما دسترسی به این بخش را ندارید.');
    }
    // اگر ادمین است یا رویداد دیگری است، اجازه ادامه داده شود
    return next();
});

// دستور /start
bot.start((ctx) => {
    if (isAdmin(ctx)) {
        ctx.reply(`سلام ${ctx.from.first_name}، به ربات مدیریت خوش آمدید!`);
        return showAdminPanel(ctx);
    } else {
        return ctx.reply('این ربات فقط برای مدیر مجاز است.');
    }
});

bot.command('panel', (ctx) => {
    if (isAdmin(ctx)) {
        return showAdminPanel(ctx);
    } else {
        return ctx.reply('دسترسی ندارید.');
    }
});

// ========================
// مدیریت کانال‌ها
// ========================
bot.action('manage_channels', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.channels || botData.channels.length === 0) {
            return ctx.reply(
                'کانالی موجود نیست. لطفاً یک کانال اضافه کنید.',
                Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن کانال', 'add_channel')]])
            );
        }
        // چیدمان ۲ ستونه
        const buttons = [];
        for (let i = 0; i < botData.channels.length; i += 2) {
            const row = [
                Markup.button.callback(botData.channels[i].title, `channel_info:${botData.channels[i].id}`)
            ];
            if (botData.channels[i + 1])
                row.push(Markup.button.callback(botData.channels[i + 1].title, `channel_info:${botData.channels[i + 1].id}`));
            buttons.push(row);
        }
        // دکمه افزودن کانال در بالای صفحه
        buttons.unshift([Markup.button.callback('➕ افزودن کانال', 'add_channel')]);
        return ctx.reply('کانال‌ها:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در مدیریت کانال‌ها:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// افزودن کانال
bot.action('add_channel', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.step = 'add_channel_username';
        return ctx.reply('لطفاً نام کاربری کانال (با @) یا شناسه عددی را وارد کنید:');
    } catch (error) {
        console.error('خطا در افزودن کانال:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// اطلاعات کانال
bot.action(/channel_info:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const channelId = ctx.match[1];
        const channel = botData.channels.find(ch => ch.id === channelId);
        if (!channel) {
            return ctx.reply('کانال مورد نظر یافت نشد.');
        }
        return ctx.reply(
            `اطلاعات کانال:\nنام: ${channel.title}\nشناسه: ${channel.id}\nنوع: ${channel.type === 'channel' ? 'کانال' : 'گروه'}`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🗑 حذف کانال', `delete_channel:${channelId}`)],
                [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
            ])
        );
    } catch (error) {
        console.error('خطا در نمایش اطلاعات کانال:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// حذف کانال
bot.action(/delete_channel:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const channelId = ctx.match[1];
        botData.channels = botData.channels.filter(ch => ch.id !== channelId);
        saveData();
        return ctx.reply('✅ کانال با موفقیت حذف شد.', Markup.inlineKeyboard([
            [Markup.button.callback('🔙 بازگشت به لیست کانال‌ها', 'manage_channels')]
        ]));
    } catch (error) {
        console.error('خطا در حذف کانال:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ========================
// ارسال پیام به کانال با دکمه‌های شیشه‌ای
// ========================
bot.action('send_message', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.channels || botData.channels.length === 0) {
            return ctx.reply(
                'کانالی موجود نیست. ابتدا یک کانال اضافه کنید.',
                Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن کانال', 'add_channel')]])
            );
        }
        // نمایش کانال‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < botData.channels.length; i += 2) {
            const row = [
                Markup.button.callback(botData.channels[i].title, `select_channel:${botData.channels[i].id}`)
            ];
            if (botData.channels[i + 1])
                row.push(Markup.button.callback(botData.channels[i + 1].title, `select_channel:${botData.channels[i + 1].id}`));
            buttons.push(row);
        }
        ctx.session.step = 'send_message_select_channel';
        return ctx.reply('کانال مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در ارسال پیام:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/select_channel:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.selectedChannel = ctx.match[1];
        ctx.session.step = 'send_message_text';
        return ctx.reply('متن پیام را وارد کنید:');
    } catch (error) {
        console.error('خطا در انتخاب کانال:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('add_buttons', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.step = 'add_button_text';
        return ctx.reply('متن دکمه را وارد کنید:');
    } catch (error) {
        console.error('خطا در افزودن دکمه:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('send_message_now', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const channelId = ctx.session.selectedChannel;
        const messageText = ctx.session.messageText;
        const buttons = ctx.session.messageButtons || [];
        
        // ساخت دکمه‌های شیشه‌ای
        const inlineKeyboard = [];
        
        if (buttons.length > 0) {
            // گروه‌بندی دکمه‌ها به صورت دو ستونه
            for (let i = 0; i < buttons.length; i += 2) {
                const row = [];
                
                // اصلاح لینک‌ها قبل از استفاده
                let url1 = buttons[i].url;
                // اگر لینک با t.me شروع می‌شود ولی https:// ندارد
                if (url1.startsWith('t.me/') && !url1.startsWith('https://t.me/')) {
                    url1 = 'https://' + url1;
                }
                
                row.push({ text: buttons[i].text, url: url1 });
                
                if (buttons[i + 1]) {
                    let url2 = buttons[i + 1].url;
                    if (url2.startsWith('t.me/') && !url2.startsWith('https://t.me/')) {
                        url2 = 'https://' + url2;
                    }
                    row.push({ text: buttons[i + 1].text, url: url2 });
                }
                
                inlineKeyboard.push(row);
            }
        }
        
        // نمایش دیباگ برای بررسی لینک‌ها
        console.log('Keyboard structure:', JSON.stringify(inlineKeyboard));
        
        // ارسال پیام با دکمه‌های شیشه‌ای
        await bot.telegram.sendMessage(channelId, messageText, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
        });
        
        ctx.reply('✅ پیام ارسال شد.');
        ctx.session = {};
        return showAdminPanel(ctx);
    } catch (error) {
        console.error('خطا در ارسال پیام:', error);
        return ctx.reply(`❌ خطا: ${error.message} - لطفاً دوباره تلاش کنید یا لینک را بررسی کنید. 
برای لینک‌های تلگرام از فرمت https://t.me/ استفاده کنید.`);
    }
});

// ========================
// زمانبندی پیام
// ========================
bot.action('schedule_message', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.channels || botData.channels.length === 0) {
            return ctx.reply(
                'کانالی موجود نیست. ابتدا یک کانال اضافه کنید.',
                Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن کانال', 'add_channel')]])
            );
        }
        // نمایش کانال‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < botData.channels.length; i += 2) {
            const row = [
                Markup.button.callback(botData.channels[i].title, `schedule_channel:${botData.channels[i].id}`)
            ];
            if (botData.channels[i + 1])
                row.push(Markup.button.callback(botData.channels[i + 1].title, `schedule_channel:${botData.channels[i + 1].id}`));
            buttons.push(row);
        }
        ctx.session.step = 'schedule_select_channel';
        return ctx.reply('کانال مورد نظر برای زمانبندی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در زمانبندی پیام:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/schedule_channel:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.selectedScheduleChannel = ctx.match[1];
        ctx.session.step = 'schedule_message_text';
        return ctx.reply('متن پیام زمانبندی را وارد کنید:');
    } catch (error) {
        console.error('خطا در انتخاب کانال زمانبندی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// روزهای زمانبندی
bot.action('schedule_select_days', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.scheduleDays = ctx.session.scheduleDays || [];
        return ctx.reply('روزهای هفته را انتخاب کنید:', Markup.inlineKeyboard([
            [
                Markup.button.callback('شنبه', 'schedule_day:6'),
                Markup.button.callback('یک‌شنبه', 'schedule_day:0')
            ],
            [
                Markup.button.callback('دوشنبه', 'schedule_day:1'),
                Markup.button.callback('سه‌شنبه', 'schedule_day:2')
            ],
            [
                Markup.button.callback('چهارشنبه', 'schedule_day:3'),
                Markup.button.callback('پنج‌شنبه', 'schedule_day:4')
            ],
            [
                Markup.button.callback('جمعه', 'schedule_day:5'),
                Markup.button.callback('هر روز', 'schedule_day:all')
            ],
            [Markup.button.callback('✅ ذخیره زمانبندی', 'save_schedule')]
        ]));
    } catch (error) {
        console.error('خطا در انتخاب روزها:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/schedule_day:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const day = ctx.match[1];
        ctx.session.scheduleDays = ctx.session.scheduleDays || [];
        if (day === 'all') {
            ctx.session.scheduleDays = ['0', '1', '2', '3', '4', '5', '6'];
            return ctx.reply('تمام روزها انتخاب شد. تنظیمات دیگری نیاز دارید؟', Markup.inlineKeyboard([
                [Markup.button.callback('✅ ذخیره زمانبندی', 'save_schedule')]
            ]));
        } else if (!ctx.session.scheduleDays.includes(day)) {
            ctx.session.scheduleDays.push(day);
            const dayNames = {
                '0': 'یک‌شنبه',
                '1': 'دوشنبه',
                '2': 'سه‌شنبه',
                '3': 'چهارشنبه',
                '4': 'پنج‌شنبه',
                '5': 'جمعه',
                '6': 'شنبه'
            };
            return ctx.reply(`روز ${dayNames[day]} انتخاب شد. روز دیگری انتخاب کنید یا ذخیره کنید:`, Markup.inlineKeyboard([
                [Markup.button.callback('✅ ذخیره زمانبندی', 'save_schedule')]
            ]));
        }
    } catch (error) {
        console.error('خطا در انتخاب روز:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('save_schedule', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!ctx.session.scheduleDays || ctx.session.scheduleDays.length === 0) {
            return ctx.reply('لطفاً حداقل یک روز انتخاب کنید.');
        }
        const channelId = ctx.session.selectedScheduleChannel;
        const messageText = ctx.session.scheduleMessageText;
        const time = ctx.session.scheduleTime;
        const days = ctx.session.scheduleDays;
        const [hours, minutes] = time.split(':').map(Number);

        let cronExpression;
        if (days.length === 7) {
            cronExpression = `${minutes} ${hours} * * *`;
        } else {
            cronExpression = `${minutes} ${hours} * * ${days.join(',')}`;
        }

        botData.scheduledMessages.push({
            id: Date.now().toString(),
            channelId,
            messageText,
            cronExpression,
            days,
            time
        });
        saveData();
        setupScheduledTasks();
        ctx.reply('✅ پیام زمانبندی ذخیره شد.');
        ctx.session = {};
        return showAdminPanel(ctx);
    } catch (error) {
        console.error('خطا در ذخیره زمانبندی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ========================
// ارسال پیام با تأخیر
// ========================
bot.action('delay_message', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.channels || botData.channels.length === 0) {
            return ctx.reply(
                'کانالی موجود نیست. ابتدا یک کانال اضافه کنید.',
                Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن کانال', 'add_channel')]])
            );
        }
        // نمایش کانال‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < botData.channels.length; i += 2) {
            const row = [
                Markup.button.callback(botData.channels[i].title, `delay_channel:${botData.channels[i].id}`)
            ];
            if (botData.channels[i + 1])
                row.push(Markup.button.callback(botData.channels[i + 1].title, `delay_channel:${botData.channels[i + 1].id}`));
            buttons.push(row);
        }
        ctx.session.step = 'delay_select_channel';
        return ctx.reply('کانال مورد نظر برای ارسال پیام با تأخیر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در تنظیم پیام تأخیری:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/delay_channel:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.selectedDelayChannel = ctx.match[1];
        ctx.session.step = 'delay_message_text';
        return ctx.reply('متن پیام با تأخیر را وارد کنید:');
    } catch (error) {
        console.error('خطا در انتخاب کانال تأخیری:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('delay_add_buttons', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.step = 'add_button_text';
        return ctx.reply('متن دکمه را وارد کنید:');
    } catch (error) {
        console.error('خطا در افزودن دکمه به پیام تأخیری:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('send_delay_message_now', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const channelId = ctx.session.selectedDelayChannel;
        const messageText = ctx.session.delayMessageText;
        const delayMinutes = ctx.session.delayMinutes;
        const buttons = ctx.session.delayMessageButtons || [];
        
        // اصلاح لینک‌های دکمه‌ها قبل از ذخیره
        const processedButtons = buttons.map(btn => {
            let url = btn.url;
            // اصلاح لینک‌های t.me
            if (url.startsWith('t.me/') && !url.startsWith('https://t.me/')) {
                url = 'https://' + url;
            }
            return { ...btn, url };
        });
        
        // ذخیره پیام در دیتابیس
        const delayedMessageId = Date.now().toString();
        botData.delayedMessages.push({
            id: delayedMessageId,
            channelId,
            messageText,
            buttons: processedButtons,
            sendAt: Date.now() + delayMinutes * 60 * 1000
        });
        saveData();
        
        ctx.reply(`✅ پیام با تأخیر ${delayMinutes} دقیقه برنامه‌ریزی شد.`);
        
        // تنظیم تایمر برای ارسال پیام
        setTimeout(async () => {
            try {
                // ساخت دکمه‌های شیشه‌ای
                const inlineKeyboard = [];
                if (processedButtons.length > 0) {
                    for (let i = 0; i < processedButtons.length; i += 2) {
                        const row = [];
                        row.push({ text: processedButtons[i].text, url: processedButtons[i].url });
                        
                        if (processedButtons[i + 1]) {
                            row.push({ text: processedButtons[i + 1].text, url: processedButtons[i + 1].url });
                        }
                        
                        inlineKeyboard.push(row);
                    }
                }
                
                console.log('Delay message keyboard:', JSON.stringify(inlineKeyboard));
                
                // ارسال پیام
                await bot.telegram.sendMessage(channelId, messageText, {
                    parse_mode: 'HTML',
                    reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
                });
                
                // حذف پیام از لیست پیام‌های تاخیری
                botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== delayedMessageId);
                saveData();
            } catch (error) {
                console.error('خطا در ارسال پیام تأخیری:', error);
            }
        }, delayMinutes * 60 * 1000);
        
        ctx.session = {};
        return showAdminPanel(ctx);
    } catch (error) {
        console.error('خطا در تنظیم پیام تأخیری:', error);
        return ctx.reply(`❌ خطا: ${error.message} - لطفاً دوباره تلاش کنید یا لینک را بررسی کنید.
برای لینک‌های تلگرام از فرمت https://t.me/ استفاده کنید.`);
    }
});

// ========================
// ایجاد نظرسنجی
// ========================
bot.action('create_poll', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.channels || botData.channels.length === 0) {
            return ctx.reply(
                'کانالی موجود نیست. ابتدا یک کانال اضافه کنید.',
                Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن کانال', 'add_channel')]])
            );
        }
        // نمایش کانال‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < botData.channels.length; i += 2) {
            const row = [
                Markup.button.callback(botData.channels[i].title, `poll_channel:${botData.channels[i].id}`)
            ];
            if (botData.channels[i + 1])
                row.push(Markup.button.callback(botData.channels[i + 1].title, `poll_channel:${botData.channels[i + 1].id}`));
            buttons.push(row);
        }
        ctx.session.step = 'poll_select_channel';
        return ctx.reply('کانال نظرسنجی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در ایجاد نظرسنجی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/poll_channel:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.selectedPollChannel = ctx.match[1];
        ctx.session.step = 'poll_question';
        return ctx.reply('سوال نظرسنجی را وارد کنید:');
    } catch (error) {
        console.error('خطا در انتخاب کانال نظرسنجی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('add_poll_option', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        return ctx.reply('گزینه دیگری اضافه کنید:');
    } catch (error) {
        console.error('خطا در افزودن گزینه نظرسنجی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action('create_poll_now', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!ctx.session.pollOptions || ctx.session.pollOptions.length < 2) {
            return ctx.reply('برای نظرسنجی حداقل دو گزینه نیاز است.');
        }
        const channelId = ctx.session.selectedPollChannel;
        const question = ctx.session.pollQuestion;
        const options = ctx.session.pollOptions;
        await bot.telegram.sendPoll(channelId, question, options, { is_anonymous: true });
        ctx.reply('✅ نظرسنجی ایجاد شد.');
        ctx.session = {};
        return showAdminPanel(ctx);
    } catch (error) {
        console.error('خطا در ارسال نظرسنجی:', error);
        return ctx.reply(`❌ خطا: ${error.message}`);
    }
});

// ========================
// تنظیم پیام خوشامدگویی در گروه
// ========================
bot.action('set_welcome', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const groups = botData.channels.filter(ch => ch.type === 'group');
        if (!groups.length) {
            return ctx.reply('هیچ گروهی موجود نیست. لطفاً ابتدا گروه اضافه کنید.', Markup.inlineKeyboard([
                [Markup.button.callback('➕ افزودن گروه', 'add_channel')]
            ]));
        }
        // نمایش گروه‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < groups.length; i += 2) {
            const row = [
                Markup.button.callback(groups[i].title, `set_welcome_group:${groups[i].id}`)
            ];
            if (groups[i + 1])
                row.push(Markup.button.callback(groups[i + 1].title, `set_welcome_group:${groups[i + 1].id}`));
            buttons.push(row);
        }
        return ctx.reply('گروه مورد نظر برای خوشامدگویی را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در تنظیم پیام خوشامدگویی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/set_welcome_group:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        ctx.session.welcomeGroupId = ctx.match[1];
        ctx.session.step = 'set_welcome_text';
        const current = botData.welcomeMessages[ctx.match[1]] || 'پیامی تنظیم نشده است.';
        return ctx.reply(`پیام خوشامدگویی فعلی:\n${current}\n\nپیام جدید را وارد کنید (می‌توانید از {user} استفاده کنید):`);
    } catch (error) {
        console.error('خطا در تنظیم گروه خوشامدگویی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ذخیره پیام خوشامدگویی
bot.action('save_welcome_message', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const groupId = ctx.session.welcomeGroupId;
        const welcomeText = ctx.session.welcomeText;
        botData.welcomeMessages[groupId] = welcomeText;
        saveData();
        ctx.reply('✅ پیام خوشامدگویی ذخیره شد.');
        ctx.session = {};
        return showAdminPanel(ctx);
    } catch (error) {
        console.error('خطا در ذخیره پیام خوشامدگویی:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ========================
// دریافت اطلاعات اعضای گروه
// ========================
bot.action('get_members', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const groups = botData.channels.filter(ch => ch.type === 'group');
        if (!groups.length) {
            return ctx.reply('هیچ گروهی موجود نیست.', Markup.inlineKeyboard([
                [Markup.button.callback('➕ افزودن گروه', 'add_channel')],
                [Markup.button.callback('🔙 بازگشت', 'panel')]
            ]));
        }
        // نمایش گروه‌ها به صورت دو ستونه
        const buttons = [];
        for (let i = 0; i < groups.length; i += 2) {
            const row = [
                Markup.button.callback(groups[i].title, `get_members_group:${groups[i].id}`)
            ];
            if (groups[i + 1])
                row.push(Markup.button.callback(groups[i + 1].title, `get_members_group:${groups[i + 1].id}`));
            buttons.push(row);
        }
        buttons.push([Markup.button.callback('🔙 بازگشت', 'panel')]);
        return ctx.reply('گروه مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در دریافت اعضا:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

bot.action(/get_members_group:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const groupId = ctx.match[1];
        const group = botData.channels.find(ch => ch.id === groupId);
        if (!group) {
            return ctx.reply('گروه مورد نظر یافت نشد.');
        }

        try {
            const chatInfo = await bot.telegram.getChat(groupId);
            const membersCount = await bot.telegram.getChatMembersCount(groupId);
            let adminsList = '';
            const admins = await bot.telegram.getChatAdministrators(groupId);

            for (const admin of admins) {
                const name = admin.user.first_name + (admin.user.last_name ? ` ${admin.user.last_name}` : '');
                const username = admin.user.username ? `@${admin.user.username}` : 'بدون نام کاربری';
                adminsList += `● ${name} (${username})\n`;
            }

            return ctx.reply(
                `📊 اطلاعات گروه ${group.title}:\n\n` +
                `🔹 تعداد اعضا: ${membersCount}\n` +
                `🔹 تعداد مدیران: ${admins.length}\n\n` +
                `👥 لیست مدیران:\n${adminsList}`,
                Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'get_members')]])
            );
        } catch (error) {
            console.error('خطا در دریافت اطلاعات گروه:', error);
            return ctx.reply(`دسترسی به اطلاعات گروه امکان‌پذیر نیست: ${error.message}`,
                Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'get_members')]]));
        }
    } catch (error) {
        console.error('خطا در دریافت اعضای گروه:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ========================
// مدیریت پیام‌های زمانبندی شده
// ========================
bot.action('manage_messages', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const keyboard = [
            [Markup.button.callback('📅 پیام‌های زمانبندی شده', 'view_scheduled_messages')],
            [Markup.button.callback('⏳ پیام‌های تأخیری', 'view_delayed_messages')],
            [Markup.button.callback('🔙 بازگشت', 'panel')]
        ];
        return ctx.reply('نوع پیام‌های مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(keyboard));
    } catch (error) {
        console.error('خطا در مدیریت پیام‌ها:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// نمایش پیام‌های زمانبندی شده
bot.action('view_scheduled_messages', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.scheduledMessages || botData.scheduledMessages.length === 0) {
            return ctx.reply('هیچ پیام زمانبندی شده‌ای وجود ندارد.',
                Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'manage_messages')]]));
        }

        let messageText = '📅 پیام‌های زمانبندی شده:\n\n';
        const buttons = [];
        for (let i = 0; i < botData.scheduledMessages.length; i++) {
            const msg = botData.scheduledMessages[i];
            const channel = botData.channels.find(ch => ch.id === msg.channelId) || { title: 'کانال ناشناس' };

            const daysMap = {
                '0': 'یکشنبه', '1': 'دوشنبه', '2': 'سه‌شنبه', '3': 'چهارشنبه',
                '4': 'پنجشنبه', '5': 'جمعه', '6': 'شنبه'
            };

            let daysText;
            if (msg.days.length === 7) {
                daysText = 'هر روز';
            } else {
                daysText = msg.days.map(d => daysMap[d]).join('، ');
            }

            messageText += `${i + 1}. کانال: ${channel.title}\n`;
            messageText += `   زمان: ${msg.time} - روزها: ${daysText}\n`;
            messageText += `   متن: ${msg.messageText.substring(0, 30)}${msg.messageText.length > 30 ? '...' : ''}\n\n`;

            buttons.push([Markup.button.callback(`🗑 حذف پیام ${i + 1}`, `delete_scheduled:${msg.id}`)]);
        }

        buttons.push([Markup.button.callback('🔙 بازگشت', 'manage_messages')]);
        return ctx.reply(messageText, Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در نمایش پیام‌های زمانبندی شده:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// حذف پیام زمانبندی شده
bot.action(/delete_scheduled:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const messageId = ctx.match[1];
        botData.scheduledMessages = botData.scheduledMessages.filter(msg => msg.id !== messageId);
        saveData();
        setupScheduledTasks(); // بازنشانی وظایف زمانبندی شده
        return ctx.reply('✅ پیام زمانبندی شده با موفقیت حذف شد.',
            Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'view_scheduled_messages')]]));
    } catch (error) {
        console.error('خطا در حذف پیام زمانبندی شده:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// نمایش پیام‌های تأخیری
bot.action('view_delayed_messages', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (!botData.delayedMessages || botData.delayedMessages.length === 0) {
            return ctx.reply('هیچ پیام تأخیری فعالی وجود ندارد.',
                Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'manage_messages')]]));
        }

        let messageText = '⏳ پیام‌های تأخیری فعال:\n\n';
        const buttons = [];
        for (let i = 0; i < botData.delayedMessages.length; i++) {
            const msg = botData.delayedMessages[i];
            const channel = botData.channels.find(ch => ch.id === msg.channelId) || { title: 'کانال ناشناس' };
            const remainingTime = Math.max(0, Math.floor((msg.sendAt - Date.now()) / 60000));

            messageText += `${i + 1}. کانال: ${channel.title}\n`;
            messageText += `   زمان باقیمانده: ${remainingTime} دقیقه\n`;
            messageText += `   متن: ${msg.messageText.substring(0, 30)}${msg.messageText.length > 30 ? '...' : ''}\n\n`;

            buttons.push([Markup.button.callback(`🗑 حذف پیام ${i + 1}`, `delete_delayed:${msg.id}`)]);
        }

        buttons.push([Markup.button.callback('🔙 بازگشت', 'manage_messages')]);
        return ctx.reply(messageText, Markup.inlineKeyboard(buttons));
    } catch (error) {
        console.error('خطا در نمایش پیام‌های تأخیری:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// حذف پیام تأخیری
bot.action(/delete_delayed:(.+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const messageId = ctx.match[1];
        botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== messageId);
        saveData();
        return ctx.reply('✅ پیام تأخیری با موفقیت حذف شد.',
            Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'view_delayed_messages')]]));
    } catch (error) {
        console.error('خطا در حذف پیام تأخیری:', error);
        return ctx.reply(`خطا: ${error.message}`);
    }
});

// ========================
// مدیریت پیام‌های ورودی
// ========================
bot.on('message', async (ctx) => {
    try {
        // فقط پیام‌های خصوصی از ادمین را پردازش می‌کنیم
        if (ctx.chat.type !== 'private' || !isAdmin(ctx)) {
            return;
        }

        const step = ctx.session.step;

        // افزودن کانال
        if (step === 'add_channel_username') {
            let chatId = ctx.message.text.trim();
            if (chatId.startsWith('@')) chatId = chatId.substring(1);

            try {
                const chat = await bot.telegram.getChat(chatId.startsWith('@') ? chatId : `@${chatId}`);
                const chatType = chat.type;
                const channelInfo = {
                    id: chat.id.toString(),
                    title: chat.title,
                    username: chat.username,
                    type: chatType
                };

                // بررسی تکراری نبودن کانال
                if (!botData.channels.some(ch => ch.id === channelInfo.id)) {
                    botData.channels.push(channelInfo);
                    saveData();
                    return ctx.reply(`✅ ${chatType === 'channel' ? 'کانال' : 'گروه'} "${channelInfo.title}" با موفقیت اضافه شد.`,
                        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به لیست کانال‌ها', 'manage_channels')]]));
                } else {
                    return ctx.reply('این کانال/گروه قبلاً اضافه شده است.',
                        Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به لیست کانال‌ها', 'manage_channels')]]));
                }
            } catch (error) {
                return ctx.reply(`❌ خطا در اضافه کردن کانال: ${error.message}\nلطفاً مطمئن شوید ربات در کانال/گروه عضو است و دسترسی مدیریت دارد.`,
                    Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'manage_channels')]]));
            }
        }

        // متن پیام ارسالی به کانال
        else if (step === 'send_message_text') {
            ctx.session.messageText = ctx.message.text;
            ctx.session.step = 'add_buttons_choice';
            return ctx.reply('متن پیام دریافت شد. آیا می‌خواهید دکمه شیشه‌ای (لینک) اضافه کنید؟',
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ بله، اضافه کن', 'add_buttons')],
                    [Markup.button.callback('❌ خیر، ارسال بدون دکمه', 'send_message_now')]
                ]));
        }

        // متن دکمه
        else if (step === 'add_button_text') {
            ctx.session.currentButtonText = ctx.message.text;
            ctx.session.step = 'add_button_url';
            return ctx.reply('لینک دکمه را وارد کنید (با https:// یا http:// یا t.me/ یا tg://):');
        }

        // لینک دکمه
        else if (step === 'add_button_url') {
            const url = ctx.message.text.trim();
            // پشتیبانی از لینک‌های تلگرام (با t.me یا tg:// شروع می‌شوند)
            if (!url.startsWith('http://') && !url.startsWith('https://') &&
                !url.startsWith('t.me/') && !url.startsWith('https://t.me/') &&
                !url.startsWith('tg://')) {
                return ctx.reply('لینک باید با http:// یا https:// یا t.me/ یا tg:// شروع شود. لطفاً مجدداً وارد کنید:');
            }

            // تصحیح لینک‌های t.me بدون https://
            let finalUrl = url;
            if (url.startsWith('t.me/') && !url.startsWith('https://t.me/')) {
                finalUrl = 'https://' + url;
                console.log(`اصلاح لینک تلگرام: ${url} -> ${finalUrl}`);
            }

            if (!ctx.session.messageButtons) ctx.session.messageButtons = [];
            if (!ctx.session.delayMessageButtons) ctx.session.delayMessageButtons = [];
            if (!ctx.session.photoMessageButtons) ctx.session.photoMessageButtons = [];

            const buttonInfo = { text: ctx.session.currentButtonText, url: finalUrl };
            console.log(`دکمه جدید: ${buttonInfo.text} -> ${buttonInfo.url}`);

            if (ctx.session.messageText) {
                ctx.session.messageButtons.push(buttonInfo);
                const buttonsText = ctx.session.messageButtons.map(btn => `- ${btn.text}`).join('\n');

                return ctx.reply(`دکمه اضافه شد. دکمه‌های فعلی:\n${buttonsText}\n\nآیا دکمه دیگری اضافه می‌کنید؟`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('➕ اضافه کردن دکمه دیگر', 'add_buttons')],
                        [Markup.button.callback('✅ ارسال پیام', 'send_message_now')]
                    ]));
            } else if (ctx.session.delayMessageText) {
                ctx.session.delayMessageButtons.push(buttonInfo);
                const buttonsText = ctx.session.delayMessageButtons.map(btn => `- ${btn.text}`).join('\n');

                return ctx.reply(`دکمه اضافه شد. دکمه‌های فعلی:\n${buttonsText}\n\nآیا دکمه دیگری اضافه می‌کنید؟`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('➕ اضافه کردن دکمه دیگر', 'delay_add_buttons')],
                        [Markup.button.callback('✅ ارسال پیام', 'send_delay_message_now')]
                    ]));
            } else if (ctx.session.photoMode) {
                ctx.session.photoMessageButtons.push(buttonInfo);
                const buttonsText = ctx.session.photoMessageButtons.map(btn => `- ${btn.text}`).join('\n');

                return ctx.reply(`دکمه اضافه شد. دکمه‌های فعلی:\n${buttonsText}\n\nآیا دکمه دیگری اضافه می‌کنید؟`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('➕ اضافه کردن دکمه دیگر', 'photo_add_buttons')],
                        [Markup.button.callback('✅ ارسال عکس با دکمه', 'send_photo_now')]
                    ]));
            }
        }

        // متن پیام زمانبندی
        else if (step === 'schedule_message_text') {
            ctx.session.scheduleMessageText = ctx.message.text;
            ctx.session.step = 'schedule_time';
            return ctx.reply('زمان ارسال را به فرمت ساعت:دقیقه وارد کنید (مثال: 14:30):');
        }

        // زمان زمانبندی
        else if (step === 'schedule_time') {
            const timePattern = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
            const time = ctx.message.text.trim();

            if (!timePattern.test(time)) {
                return ctx.reply('❌ فرمت زمان اشتباه است. لطفاً به صورت ساعت:دقیقه وارد کنید (مثال: 14:30):');
            }

            ctx.session.scheduleTime = time;
            return ctx.reply('زمان دریافت شد. حالا روزهای هفته را انتخاب کنید:',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('🗓 انتخاب روزها', 'schedule_select_days')
                    ]
                ]));
        }

        // متن پیام تأخیری
        else if (step === 'delay_message_text') {
            ctx.session.delayMessageText = ctx.message.text;
            ctx.session.step = 'delay_minutes';
            return ctx.reply('تأخیر چند دقیقه باشد؟ (عدد وارد کنید):');
        }

        // دقایق تأخیر
        else if (step === 'delay_minutes') {
            const minutes = parseInt(ctx.message.text.trim());
            if (isNaN(minutes) || minutes <= 0) {
                return ctx.reply('❌ لطفاً یک عدد مثبت وارد کنید:');
            }

            ctx.session.delayMinutes = minutes;
            ctx.session.step = 'delay_buttons_choice';
            return ctx.reply('آیا می‌خواهید دکمه شیشه‌ای (لینک) اضافه کنید؟',
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ بله، اضافه کن', 'delay_add_buttons')],
                    [Markup.button.callback('❌ خیر، ارسال بدون دکمه', 'send_delay_message_now')]
                ]));
        }

        // سوال نظرسنجی
        else if (step === 'poll_question') {
            ctx.session.pollQuestion = ctx.message.text;
            ctx.session.pollOptions = [];
            ctx.session.step = 'poll_option';
            return ctx.reply('گزینه اول نظرسنجی را وارد کنید:');
        }

        // گزینه‌های نظرسنجی
        else if (step === 'poll_option') {
            if (!ctx.session.pollOptions) ctx.session.pollOptions = [];
            ctx.session.pollOptions.push(ctx.message.text);

            if (ctx.session.pollOptions.length < 2) {
                return ctx.reply('گزینه دوم نظرسنجی را وارد کنید:');
            } else {
                return ctx.reply(`گزینه‌های فعلی:\n${ctx.session.pollOptions.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\nآیا گزینه دیگری اضافه می‌کنید؟`,
                    Markup.inlineKeyboard([
                        [Markup.button.callback('➕ افزودن گزینه دیگر', 'add_poll_option')],
                        [Markup.button.callback('✅ ایجاد نظرسنجی', 'create_poll_now')]
                    ]));
            }
        }

        // متن پیام خوشامدگویی
        else if (step === 'set_welcome_text') {
            ctx.session.welcomeText = ctx.message.text;
            return ctx.reply('پیام خوشامدگویی دریافت شد. برای ذخیره تأیید کنید:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ ذخیره پیام', 'save_welcome_message')]
                ]));
        }

        // اگر مرحله‌ای تعریف نشده بود، دستورات را نمایش می‌دهیم
        else {
            return showAdminPanel(ctx);
        }
    } catch (error) {
        console.error('خطا در پردازش پیام:', error);
        return ctx.reply(`❌ خطایی رخ داد: ${error.message}`);
    }
});

// ========================
// رویدادهای گروه (عضویت جدید)
// ========================
bot.on('new_chat_members', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        // اگر پیام خوشامدگویی برای این گروه تنظیم شده باشد
        if (botData.welcomeMessages[chatId]) {
            const newMember = ctx.message.new_chat_member;
            if (newMember.is_bot) return; // به ربات‌ها خوشامد نمی‌گوییم

            const userName = newMember.first_name + (newMember.last_name ? ` ${newMember.last_name}` : '');
            const welcomeMessage = botData.welcomeMessages[chatId].replace('{user}', userName);

            await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
        }
    } catch (error) {
        console.error('خطا در ارسال پیام خوشامدگویی:', error);
    }
});

// ========================
// راه‌اندازی وظایف زمانبندی‌شده
// ========================
let scheduledTasks = [];

function setupScheduledTasks() {
    // پاک کردن وظایف قبلی
    for (const task of scheduledTasks) {
        task.stop();
    }
    scheduledTasks = [];

    // ایجاد وظایف جدید
    for (const message of botData.scheduledMessages) {
        try {
            const task = cron.schedule(message.cronExpression, async () => {
                try {
                    await bot.telegram.sendMessage(message.channelId, message.messageText, { parse_mode: 'HTML' });
                    console.log(`پیام زمانبندی‌شده به کانال ${message.channelId} ارسال شد.`);
                } catch (error) {
                    console.error(`خطا در ارسال پیام زمانبندی‌شده: ${error.message}`);
                }
            });
            scheduledTasks.push(task);
        } catch (error) {
            console.error(`خطا در تنظیم وظیفه زمانبندی‌شده: ${error.message}`);
        }
    }
}

// ========================
// راه‌اندازی اولیه ربات
// ========================
async function startBot() {
    try {
        // بارگذاری داده‌های ذخیره شده
        loadData();

        // راه‌اندازی وظایف زمانبندی شده
        setupScheduledTasks();

        // راه‌اندازی ربات
        await bot.launch();
        console.log('🤖 ربات با موفقیت راه‌اندازی شد.');

        // ایجاد فایل داده اگر وجود ندارد
        if (!fs.existsSync(DATA_FILE)) {
            saveData();
        }
    } catch (error) {
        console.error('❌ خطا در راه‌اندازی ربات:', error);
    }
}

// بازرسی و ارسال مجدد پیام‌های تأخیری هنگام راه‌اندازی مجدد
function setupDelayedMessages() {
    for (const msg of botData.delayedMessages) {
        const now = Date.now();
        if (msg.sendAt <= now) {
            // ارسال فوری پیام‌های معوق
            setTimeout(async () => {
                try {
                    // ساخت دکمه‌های شیشه‌ای
                    const inlineKeyboard = [];
                    if (msg.buttons && msg.buttons.length > 0) {
                        for (let i = 0; i < msg.buttons.length; i += 2) {
                            const row = [];
                            row.push({ text: msg.buttons[i].text, url: msg.buttons[i].url });
                            
                            if (msg.buttons[i + 1]) {
                                row.push({ text: msg.buttons[i + 1].text, url: msg.buttons[i + 1].url });
                            }
                            
                            inlineKeyboard.push(row);
                        }
                    }
                    
                    // ارسال پیام
                    await bot.telegram.sendMessage(msg.channelId, msg.messageText, {
                        parse_mode: 'HTML',
                        reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
                    });
                    
                    // حذف پیام از لیست
                    botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
                    saveData();
                    console.log('پیام تأخیری معوق با موفقیت ارسال شد');
                } catch (error) {
                    console.error('خطا در ارسال پیام تأخیری معوق:', error);
                }
            }, 1000);
        } else {
            // زمانبندی پیام‌های آینده
            const delay = msg.sendAt - now;
            setTimeout(async () => {
                try {
                    // ساخت دکمه‌های شیشه‌ای
                    const inlineKeyboard = [];
                    if (msg.buttons && msg.buttons.length > 0) {
                        for (let i = 0; i < msg.buttons.length; i += 2) {
                            const row = [];
                            row.push({ text: msg.buttons[i].text, url: msg.buttons[i].url });
                            
                            if (msg.buttons[i + 1]) {
                                row.push({ text: msg.buttons[i + 1].text, url: msg.buttons[i + 1].url });
                            }
                            
                            inlineKeyboard.push(row);
                        }
                    }
                    
                    // ارسال پیام
                    await bot.telegram.sendMessage(msg.channelId, msg.messageText, {
                        parse_mode: 'HTML',
                        reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
                    });
                    
                    // حذف پیام از لیست
                    botData.delayedMessages = botData.delayedMessages.filter(m => m.id !== msg.id);
                    saveData();
                    console.log('پیام تأخیری با موفقیت ارسال شد');
                } catch (error) {
                    console.error('خطا در ارسال پیام تأخیری:', error);
                }
            }, delay);
        }
    }
}

// راه‌اندازی ربات
startBot();
setupDelayedMessages();

// مدیریت خروج
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    console.log('ربات متوقف شد.');
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    console.log('ربات متوقف شد.');
});
