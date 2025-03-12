const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const cron = require('node-cron');
const moment = require('moment');

// Data storage paths
const DATA_FILE = 'bot_data.json';

// Initialize bot
const BOT_TOKEN = '8069263840:AAF2JTFJl6cfo7z1rU_CegYnCNJH6bLXcg0'; // Replace with your bot token
const ADMIN_ID = 6712954701; // Replace with your numeric Telegram ID

// Data structure
let botData = {
  scheduledMessages: [],
  welcomeMessages: {},
  polls: [],
  channels: [],
  delayedMessages: []
};

// Load data from file if exists
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      botData = JSON.parse(data);
      console.log('Data loaded successfully');
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Save data to file
function saveData() {
  try {
    const serialized = JSON.stringify(botData, null, 2);
    fs.writeFileSync(DATA_FILE, serialized, 'utf8');
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Check if user is admin
function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// Admin middleware
function adminMiddleware(ctx, next) {
  if (isAdmin(ctx)) {
    return next();
  } else {
    ctx.reply('⛔️ شما دسترسی به این بخش را ندارید.');
  }
}

// Main admin panel
function showAdminPanel(ctx) {
  ctx.reply('🖥 پنل مدیریت کانال', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📝 ارسال پیام', 'send_message')],
      [Markup.button.callback('⏱ زمانبندی پیام', 'schedule_message')],
      [Markup.button.callback('⏲ پیام با تاخیر', 'delay_message')],
      [Markup.button.callback('📊 ایجاد نظرسنجی', 'create_poll')],
      [Markup.button.callback('👋 تنظیم پیام خوشامدگویی', 'set_welcome')],
      [Markup.button.callback('👥 دریافت لیست اعضا', 'get_members')],
      [Markup.button.callback('📺 مدیریت کانال‌ها', 'manage_channels')],
      [Markup.button.callback('🔄 مدیریت پیام‌ها', 'manage_messages')]
    ])
  });
}

// Setup commands
bot.start((ctx) => {
  if (isAdmin(ctx)) {
    ctx.reply(`سلام ${ctx.from.first_name}! به ربات مدیریت کانال خوش آمدید.`);
    showAdminPanel(ctx);
  } else {
    ctx.reply('این ربات فقط برای مدیر قابل استفاده است.');
  }
});

bot.help((ctx) => {
  if (isAdmin(ctx)) {
    ctx.reply(`
🔹 راهنمای ربات مدیریت کانال:

/start - شروع کار با ربات
/panel - نمایش پنل مدیریت
/help - نمایش این راهنما
    `);
  }
});

bot.command('panel', adminMiddleware, (ctx) => {
  showAdminPanel(ctx);
});

// Handle inline buttons
bot.action('send_message', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'send_message_select_channel' };

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(channel.title, `select_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('لطفا کانال مورد نظر را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

bot.action(/select_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.session.selectedChannel = channelId;
  ctx.session.step = 'send_message_text';

  ctx.reply('متن پیام را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'send_message')]
    ])
  });
});

// Add message buttons
bot.action('add_buttons', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.step = 'add_button_text';
  ctx.session.messageButtons = ctx.session.messageButtons || [];

  ctx.reply('متن دکمه را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('پایان افزودن دکمه', 'finish_buttons')],
      [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
    ])
  });
});

// Schedule message handler
bot.action('schedule_message', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'schedule_select_channel' };

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(channel.title, `schedule_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('لطفا کانال مورد نظر برای زمانبندی پیام را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Delay message handler
bot.action('delay_message', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'delay_select_channel' };

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(channel.title, `delay_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('لطفا کانال مورد نظر برای ارسال پیام با تاخیر را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Create poll handler
bot.action('create_poll', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'poll_select_channel' };

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(channel.title, `poll_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('لطفا کانال مورد نظر برای ایجاد نظرسنجی را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Manage channels
bot.action('manage_channels', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(`${channel.title}`, `channel_info:${channel.id}`)]
  );

  channelButtons.push([Markup.button.callback('➕ افزودن کانال جدید', 'add_channel')]);
  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('مدیریت کانال‌ها:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Add channel handler
bot.action('add_channel', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = { step: 'add_channel_username' };

  ctx.reply('لطفا نام کاربری کانال را با @ وارد کنید یا شناسه عددی آن را بفرستید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
    ])
  });
});

// Manage messages
bot.action('manage_messages', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(`${channel.title}`, `manage_messages_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('مدیریت پیام‌ها - کانال مورد نظر را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Welcome message setup
bot.action('set_welcome', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const groupButtons = botData.channels
    .filter(channel => channel.type === 'group')
    .map(group => [Markup.button.callback(group.title, `set_welcome_group:${group.id}`)]);

  if (groupButtons.length === 0) {
    return ctx.reply('ابتدا گروهی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن گروه', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  groupButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('انتخاب گروه برای تنظیم پیام خوشامدگویی:', {
    reply_markup: Markup.inlineKeyboard(groupButtons)
  });
});

// Get members
bot.action('get_members', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const channelButtons = botData.channels.map(channel => 
    [Markup.button.callback(channel.title, `get_members_channel:${channel.id}`)]
  );

  if (channelButtons.length === 0) {
    return ctx.reply('ابتدا کانالی را اضافه کنید', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('افزودن کانال', 'add_channel')],
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }

  channelButtons.push([Markup.button.callback('🔙 بازگشت', 'back_to_main')]);

  ctx.reply('دریافت لیست اعضا - کانال مورد نظر را انتخاب کنید:', {
    reply_markup: Markup.inlineKeyboard(channelButtons)
  });
});

// Back to main menu
bot.action('back_to_main', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  showAdminPanel(ctx);
});

// Handle text messages for various steps
bot.on('text', (ctx) => {
  if (!isAdmin(ctx)) return;

  const text = ctx.message.text;
  const session = ctx.session || {};

  switch (session.step) {
    case 'send_message_text':
      ctx.session.messageText = text;
      ctx.session.step = 'send_message_buttons';
      ctx.reply('آیا می‌خواهید دکمه‌هایی به پیام اضافه کنید؟', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ بله', 'add_buttons')],
          [Markup.button.callback('❌ خیر', 'send_message_now')]
        ])
      });
      break;

    case 'add_button_text':
      ctx.session.currentButtonText = text;
      ctx.session.step = 'add_button_url';
      ctx.reply('لینک دکمه را وارد کنید:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'add_buttons')]
        ])
      });
      break;

    case 'add_button_url':
      if (!ctx.session.messageButtons) ctx.session.messageButtons = [];
      ctx.session.messageButtons.push({
        text: ctx.session.currentButtonText,
        url: text
      });

      const buttonsPreview = ctx.session.messageButtons.map(btn => `[${btn.text}](${btn.url})`).join('\n');

      ctx.reply(`دکمه اضافه شد. دکمه‌های فعلی:\n${buttonsPreview}`, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('➕ افزودن دکمه دیگر', 'add_buttons')],
          [Markup.button.callback('✅ پایان و ارسال', 'send_message_now')]
        ])
      });
      ctx.session.step = 'send_message_buttons';
      break;

    case 'add_channel_username':
      const channelId = text.startsWith('@') ? text : text;

      // Check if channel already exists
      const existingChannel = botData.channels.find(ch => ch.id === channelId);
      if (existingChannel) {
        ctx.reply('این کانال قبلا اضافه شده است!', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
          ])
        });
        break;
      }

      ctx.session.newChannelId = channelId;
      ctx.session.step = 'add_channel_title';
      ctx.reply('نام نمایشی کانال را وارد کنید:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'add_channel')]
        ])
      });
      break;

    case 'add_channel_title':
      const newChannel = {
        id: ctx.session.newChannelId,
        title: text,
        type: ctx.session.newChannelId.startsWith('@') ? 'channel' : 'group'
      };

      botData.channels.push(newChannel);
      saveData();

      ctx.reply(`✅ کانال "${text}" با موفقیت اضافه شد.`, {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت به مدیریت کانال‌ها', 'manage_channels')]
        ])
      });
      break;

    case 'schedule_message_text':
      ctx.session.scheduleMessageText = text;
      ctx.session.step = 'schedule_message_time';
      ctx.reply('زمان ارسال را به فرمت HH:MM وارد کنید (مثال: 14:30):', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
        ])
      });
      break;

    case 'schedule_message_time':
      // Validate time format
      if (!/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.test(text)) {
        ctx.reply('فرمت زمان اشتباه است. لطفا به صورت HH:MM وارد کنید (مثال: 14:30)');
        break;
      }

      ctx.session.scheduleTime = text;
      ctx.session.step = 'schedule_message_days';

      ctx.reply('روزهای ارسال را انتخاب کنید:', {
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('شنبه', 'schedule_day:6'),
            Markup.button.callback('یکشنبه', 'schedule_day:0'),
            Markup.button.callback('دوشنبه', 'schedule_day:1')
          ],
          [
            Markup.button.callback('سه‌شنبه', 'schedule_day:2'),
            Markup.button.callback('چهارشنبه', 'schedule_day:3'),
            Markup.button.callback('پنجشنبه', 'schedule_day:4')
          ],
          [
            Markup.button.callback('جمعه', 'schedule_day:5'),
            Markup.button.callback('هر روز', 'schedule_day:all')
          ],
          [Markup.button.callback('✅ تأیید و ذخیره', 'save_schedule')],
          [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
        ])
      });
      break;

    case 'delay_message_text':
      ctx.session.delayMessageText = text;
      ctx.session.step = 'delay_message_minutes';
      ctx.reply('تعداد دقیقه تاخیر را وارد کنید (مثال: 30):', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'delay_message')]
        ])
      });
      break;

    case 'delay_message_minutes':
      // Validate minutes
      const minutes = parseInt(text);
      if (isNaN(minutes) || minutes <= 0) {
        ctx.reply('لطفا یک عدد مثبت وارد کنید');
        break;
      }

      ctx.session.delayMinutes = minutes;
      ctx.session.step = 'delay_message_buttons';
      ctx.reply('آیا می‌خواهید دکمه‌هایی به پیام اضافه کنید؟', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ بله', 'delay_add_buttons')],
          [Markup.button.callback('❌ خیر', 'send_delay_message_now')]
        ])
      });
      break;

    case 'poll_question':
      ctx.session.pollQuestion = text;
      ctx.session.pollOptions = [];
      ctx.session.step = 'poll_options';
      ctx.reply('گزینه اول را وارد کنید:', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'create_poll')]
        ])
      });
      break;

    case 'poll_options':
      if (!ctx.session.pollOptions) ctx.session.pollOptions = [];

      ctx.session.pollOptions.push(text);

      if (ctx.session.pollOptions.length >= 10) {
        const optionsPreview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');

        ctx.reply(`حداکثر تعداد گزینه‌ها اضافه شد. گزینه‌های فعلی:\n${optionsPreview}`, {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('✅ ایجاد نظرسنجی', 'create_poll_now')]
          ])
        });
        break;
      }

      const optionsPreview = ctx.session.pollOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n');

      ctx.reply(`گزینه اضافه شد. گزینه‌های فعلی:\n${optionsPreview}\n\nگزینه بعدی را وارد کنید یا دکمه پایان را بزنید:`, {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ پایان و ایجاد نظرسنجی', 'create_poll_now')]
        ])
      });
      break;

    case 'set_welcome_text':
      const groupId = ctx.session.welcomeGroupId;
      botData.welcomeMessages[groupId] = text;
      saveData();

      ctx.reply('✅ پیام خوشامدگویی با موفقیت تنظیم شد.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
        ])
      });
      break;

    case 'edit_message_text':
      ctx.session.newMessageText = text;

      try {
        await bot.telegram.editMessageText(
          ctx.session.editChannelId,
          ctx.session.editMessageId,
          null,
          text,
          { parse_mode: 'HTML' }
        );

        ctx.reply('✅ پیام با موفقیت ویرایش شد.', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
          ])
        });
      } catch (error) {
        ctx.reply(`❌ خطا در ویرایش پیام: ${error.message}`, {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
          ])
        });
      }
      break;

    default:
      // No active session or unknown step
      if (isAdmin(ctx)) {
        ctx.reply('برای استفاده از امکانات ربات، از دکمه‌های زیر استفاده کنید:', {
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🖥 نمایش پنل مدیریت', 'back_to_main')]
          ])
        });
      }
  }
});

// Action handlers for various operations
bot.action('send_message_now', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const channelId = ctx.session.selectedChannel;
  const messageText = ctx.session.messageText;
  const buttons = ctx.session.messageButtons || [];

  // Create inline keyboard if there are buttons
  const inlineKeyboard = [];

  if (buttons.length > 0) {
    // Group buttons by 2
    for (let i = 0; i < buttons.length; i += 2) {
      const row = [];
      row.push(Markup.button.url(buttons[i].text, buttons[i].url));

      if (buttons[i + 1]) {
        row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
      }

      inlineKeyboard.push(row);
    }
  }

  try {
    await bot.telegram.sendMessage(channelId, messageText, {
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
    });

    ctx.reply('✅ پیام با موفقیت ارسال شد.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_main')]
      ])
    });
  } catch (error) {
    ctx.reply(`❌ خطا در ارسال پیام: ${error.message}`, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }
});

// Schedule message action handlers
bot.action(/schedule_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.session.selectedScheduleChannel = channelId;
  ctx.session.step = 'schedule_message_text';

  ctx.reply('متن پیام زمانبندی شده را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'schedule_message')]
    ])
  });
});

bot.action(/schedule_day:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const day = ctx.match[1];

  ctx.session.scheduleDays = ctx.session.scheduleDays || [];

  if (day === 'all') {
    ctx.session.scheduleDays = ['0', '1', '2', '3', '4', '5', '6'];
    ctx.reply('هر روز هفته انتخاب شد');
  } else {
    if (!ctx.session.scheduleDays.includes(day)) {
      ctx.session.scheduleDays.push(day);

      const dayNames = {
        '0': 'یکشنبه',
        '1': 'دوشنبه',
        '2': 'سه‌شنبه',
        '3': 'چهارشنبه',
        '4': 'پنجشنبه',
        '5': 'جمعه',
        '6': 'شنبه'
      };

      const selectedDays = ctx.session.scheduleDays.map(d => dayNames[d]).join('، ');
      ctx.reply(`روزهای انتخاب شده: ${selectedDays}`);
    }
  }
});

bot.action('save_schedule', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  if (!ctx.session.scheduleDays || ctx.session.scheduleDays.length === 0) {
    return ctx.reply('لطفا حداقل یک روز را انتخاب کنید');
  }

  const channelId = ctx.session.selectedScheduleChannel;
  const messageText = ctx.session.scheduleMessageText;
  const time = ctx.session.scheduleTime;
  const days = ctx.session.scheduleDays;

  const [hours, minutes] = time.split(':').map(Number);

  // Create cron expression
  let cronExpression;
  if (days.length === 7) {
    cronExpression = `${minutes} ${hours} * * *`; // Every day
  } else {
    cronExpression = `${minutes} ${hours} * * ${days.join(',')}`; // Specific days
  }

  const scheduleId = Date.now().toString();

  botData.scheduledMessages.push({
    id: scheduleId,
    channelId,
    messageText,
    cronExpression,
    days,
    time
  });

  saveData();
  setupScheduledTasks();

  ctx.reply('✅ پیام زمانبندی شده با موفقیت ذخیره شد.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_main')]
    ])
  });
});

// Delayed message action handlers
bot.action(/delay_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.session.selectedDelayChannel = channelId;
  ctx.session.step = 'delay_message_text';

  ctx.reply('متن پیام با تاخیر را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'delay_message')]
    ])
  });
});

bot.action('send_delay_message_now', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  const channelId = ctx.session.selectedDelayChannel;
  const messageText = ctx.session.delayMessageText;
  const delayMinutes = ctx.session.delayMinutes;
  const buttons = ctx.session.delayMessageButtons || [];

  // Create inline keyboard if there are buttons
  const inlineKeyboard = [];

  if (buttons.length > 0) {
    // Group buttons by 2
    for (let i = 0; i < buttons.length; i += 2) {
      const row = [];
      row.push(Markup.button.url(buttons[i].text, buttons[i].url));

      if (buttons[i + 1]) {
        row.push(Markup.button.url(buttons[i + 1].text, buttons[i + 1].url));
      }

      inlineKeyboard.push(row);
    }
  }

  const delayedMessageId = Date.now().toString();

  botData.delayedMessages.push({
    id: delayedMessageId,
    channelId,
    messageText,
    buttons,
    sendAt: Date.now() + (delayMinutes * 60 * 1000)
  });

  saveData();

  ctx.reply(`✅ پیام با تاخیر ${delayMinutes} دقیقه زمانبندی شد.`, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_main')]
    ])
  });

  // Set timeout to send the message
  setTimeout(async () => {
    try {
      await bot.telegram.sendMessage(channelId, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
      });

      // Remove from delayedMessages after sending
      botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== delayedMessageId);
      saveData();

    } catch (error) {
      console.error('Error sending delayed message:', error);
    }
  }, delayMinutes * 60 * 1000);
});

// Poll action handlers
bot.action(/poll_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  ctx.session.selectedPollChannel = channelId;
  ctx.session.step = 'poll_question';

  ctx.reply('سوال نظرسنجی را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'create_poll')]
    ])
  });
});

bot.action('create_poll_now', adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();

  if (!ctx.session.pollOptions || ctx.session.pollOptions.length < 2) {
    return ctx.reply('نظرسنجی باید حداقل دو گزینه داشته باشد');
  }

  const channelId = ctx.session.selectedPollChannel;
  const question = ctx.session.pollQuestion;
  const options = ctx.session.pollOptions;

  try {
    await bot.telegram.sendPoll(channelId, question, options, {
      is_anonymous: true
    });

    ctx.reply('✅ نظرسنجی با موفقیت ایجاد شد.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_main')]
      ])
    });
  } catch (error) {
    ctx.reply(`❌ خطا در ایجاد نظرسنجی: ${error.message}`, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_main')]
      ])
    });
  }
});

// Welcome message action handlers
bot.action(/set_welcome_group:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const groupId = ctx.match[1];
  ctx.session.welcomeGroupId = groupId;
  ctx.session.step = 'set_welcome_text';

  const currentWelcome = botData.welcomeMessages[groupId] || 'پیام خوشامدگویی تنظیم نشده است';

  ctx.reply(`پیام خوشامدگویی فعلی:\n${currentWelcome}\n\nپیام جدید را وارد کنید (می‌توانید از {user} برای نمایش نام کاربر استفاده کنید):`, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'set_welcome')]
    ])
  });
});

// Get members action handlers
bot.action(/get_members_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];

  try {
    ctx.reply('در حال دریافت اطلاعات اعضا...');

    // Note: This requires admin privileges in the channel
    // And may not work for larger channels due to API limitations
    const chatMembers = await bot.telegram.getChatAdministrators(channelId);

    if (chatMembers && chatMembers.length > 0) {
      const membersInfo = chatMembers.map(member => 
        `${member.user.first_name} ${member.user.last_name || ''} ${member.user.username ? '@' + member.user.username : ''}`
      ).join('\n');

      ctx.reply(`ادمین‌های کانال/گروه:\n${membersInfo}`, {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'get_members')]
        ])
      });
    } else {
      ctx.reply('اطلاعات اعضا یافت نشد یا دسترسی کافی ندارید.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت', 'get_members')]
        ])
      });
    }
  } catch (error) {
    ctx.reply(`❌ خطا در دریافت اطلاعات اعضا: ${error.message}`, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'get_members')]
      ])
    });
  }
});

// Manage messages action handlers
bot.action(/manage_messages_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];

  ctx.reply('برای مدیریت پیام، شناسه (ID) پیام را وارد کنید یا پیام را فوروارد کنید.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
    ])
  });

  ctx.session.step = 'manage_message_id';
  ctx.session.manageMessageChannelId = channelId;
});

// Channel info action handlers
bot.action(/channel_info:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];

  const channel = botData.channels.find(ch => ch.id === channelId);

  if (!channel) {
    return ctx.reply('کانال یافت نشد!', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
      ])
    });
  }

  ctx.reply(`اطلاعات کانال:\nشناسه: ${channel.id}\nنام: ${channel.title}\nنوع: ${channel.type === 'channel' ? 'کانال' : 'گروه'}`, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('❌ حذف کانال', `delete_channel:${channelId}`)],
      [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
    ])
  });
});

bot.action(/delete_channel:(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];

  botData.channels = botData.channels.filter(ch => ch.id !== channelId);
  saveData();

  ctx.reply('✅ کانال با موفقیت حذف شد.', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'manage_channels')]
    ])
  });
});

// Handle forwarded messages for message management
bot.on('message', (ctx) => {
  if (!isAdmin(ctx)) return;

  if (ctx.session && ctx.session.step === 'manage_message_id' && ctx.message.forward_from_message_id) {
    const messageId = ctx.message.forward_from_message_id;
    const channelId = ctx.session.manageMessageChannelId;

    ctx.reply(`پیام با شناسه ${messageId} انتخاب شد. عملیات مورد نظر را انتخاب کنید:`, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('✏️ ویرایش متن', `edit_message:${channelId}:${messageId}`)],
        [Markup.button.callback('🗑 حذف پیام', `delete_message:${channelId}:${messageId}`)],
        [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
      ])
    });
  }
});

bot.action(/edit_message:(.+):(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const messageId = ctx.match[2];

  ctx.session.editChannelId = channelId;
  ctx.session.editMessageId = messageId;
  ctx.session.step = 'edit_message_text';

  ctx.reply('متن جدید پیام را وارد کنید:', {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
    ])
  });
});

bot.action(/delete_message:(.+):(.+)/, adminMiddleware, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const messageId = ctx.match[2];

  try {
    await bot.telegram.deleteMessage(channelId, messageId);
    ctx.reply('✅ پیام با موفقیت حذف شد.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
      ])
    });
  } catch (error) {
    ctx.reply(`❌ خطا در حذف پیام: ${error.message}`, {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'manage_messages')]
      ])
    });
  }
});

// Handle new chat members for welcome message
bot.on('new_chat_members', (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (botData.welcomeMessages && botData.welcomeMessages[chatId]) {
    const newMember = ctx.message.new_chat_member;
    let welcomeMessage = botData.welcomeMessages[chatId];

    // Replace {user} with the user's name
    welcomeMessage = welcomeMessage.replace('{user}', newMember.first_name);

    ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
  }
});

// Set up scheduled tasks
function setupScheduledTasks() {
  // Clear all scheduled tasks
  Object.keys(cron.getTasks()).forEach(taskId => {
    cron.getTasks()[taskId].stop();
  });

  // Set up new tasks
  botData.scheduledMessages.forEach(message => {
    cron.schedule(message.cronExpression, async () => {
      try {
        await bot.telegram.sendMessage(message.channelId, message.messageText, {
          parse_mode: 'HTML'
        });
        console.log(`Scheduled message sent to ${message.channelId}`);
      } catch (error) {
        console.error('Error sending scheduled message:', error);
      }
    });
  });
}

// Process delayed messages on startup
function processDelayedMessages() {
  const now = Date.now();

  botData.delayedMessages.forEach(message => {
    if (message.sendAt > now) {
      // Set timeout for future messages
      const delay = message.sendAt - now;

      setTimeout(async () => {
        try {
          const inlineKeyboard = [];

          if (message.buttons && message.buttons.length > 0) {
            // Group buttons by 2
            for (let i = 0; i < message.buttons.length; i += 2) {
              const row = [];
              row.push(Markup.button.url(message.buttons[i].text, message.buttons[i].url));

              if (message.buttons[i + 1]) {
                row.push(Markup.button.url(message.buttons[i + 1].text, message.buttons[i + 1].url));
              }

              inlineKeyboard.push(row);
            }
          }

          await bot.telegram.sendMessage(message.channelId, message.messageText, {
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined
          });

          // Remove from delayedMessages after sending
          botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== message.id);
          saveData();

        } catch (error) {
          console.error('Error sending delayed message:', error);
        }
      }, delay);
    } else {
      // Remove expired delayed messages
      botData.delayedMessages = botData.delayedMessages.filter(msg => msg.id !== message.id);
      saveData();
    }
  });
}

// Initialize bot
function initBot() {
  loadData();
  setupScheduledTasks();
  processDelayedMessages();

  // Set up session middleware
  bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    return next();
  });

  // Start bot
  bot.launch()
    .then(() => console.log('Bot started successfully'))
    .catch(err => console.error('Error starting bot:', err));

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

initBot();