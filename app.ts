import { MessagesMessage } from 'vk-io/lib/api/schemas/objects';
import { MessageContext, VK } from 'vk-io';
import _ from 'underscore';
import fs from 'fs/promises';
import { config } from 'dotenv';
import {
    formatISO,
    isWithinInterval,
    lastDayOfWeek,
    parseISO,
    set,
    subDays
} from 'date-fns';
import { CronJob } from 'cron';

config();

const DB_USERS_FILE = 'db_users.json';
const DB_FECES_FILE = 'db_feces.json';
const DB_JOBS_FILE = 'db_cronjobs.json';
const cronJobs: ChatCronJob[] = [];

interface ChatCronJob {
    job: CronJob;
    chatId: number;
}
interface ChatWeekReport {
    chatId: number;
    cronTime: string;
}
interface User {
    id: number;
    firstname: string;
    lastname: string;
}
interface FecesItem {
    userId: number;
    chatId: number;
    createdAt: string;
}
interface UserPoop {
    firstName: string;
    lastName: string;
    count: number;
}

const vk = new VK({
    token: process.env.TOKEN,
    pollingGroupId: parseInt(process.env.GROUPID)
});

const replies = [
    'С облегчением!',
    'Не забыл(-а) смыть?',
    'Опусти стульчак!',
    'Молодец!',
    'Умничка!',
    'Неожидал...',
    'Крутой!',
    'Йооооо',
    'Мы все удивлены',
    'Во дает'
];
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
}

async function getDBUsers(): Promise<User[]> {
    const db = await fs.readFile(DB_USERS_FILE, { encoding: 'utf-8' });
    const users: User[] = JSON.parse(db);
    return users;
}
async function saveDBUsers(users: User[]): Promise<void> {
    await fs.writeFile(DB_USERS_FILE, JSON.stringify(users));
}
async function getDBItems(): Promise<FecesItem[]> {
    const db = await fs.readFile(DB_FECES_FILE, { encoding: 'utf-8' });
    const feces: FecesItem[] = JSON.parse(db);
    return feces;
}
async function saveDBItems(feces: FecesItem[]): Promise<void> {
    await fs.writeFile(DB_FECES_FILE, JSON.stringify(feces));
}
async function getDBChatWeekReports(): Promise<ChatWeekReport[]> {
    const db = await fs.readFile(DB_JOBS_FILE, { encoding: 'utf-8' });
    const reports: ChatWeekReport[] = JSON.parse(db);
    return reports;
}
async function saveDBChatWeekReports(reports: ChatWeekReport[]): Promise<void> {
    await fs.writeFile(DB_JOBS_FILE, JSON.stringify(reports));
}
async function loadWeekReportsCronJobs() {
    const reports = await getDBChatWeekReports();
    console.log('Loading cron jobs', reports);
    const jobs = reports.map<ChatCronJob>((report) => ({
        chatId: report.chatId,
        job: CronJob.from({
            cronTime: report.cronTime,
            onTick: () => onWeekReport(report.chatId),
            timeZone: 'Europe/Moscow',
            start: true
        })
    }));
    cronJobs.push(...jobs);
}

async function handleAnalyze(ctx: MessageContext) {
    console.log('Analyze command from chat', ctx.chatId);
    ctx.send('🚽 Анализирую ваши туалеты... 🕜');

    const users = await getDBUsers();
    const items = await getDBItems();
    const members = await vk.api.messages.getConversationMembers({
        peer_id: ctx.peerId,
        extended: 1
    });

    const newMembers = members.profiles.filter((m) => !users.some((u) => u.id == m.id));
    users.push(
        ...newMembers.map<User>((m) => ({
            id: m.id,
            firstname: m.first_name,
            lastname: m.last_name
        }))
    );
    await saveDBUsers(users);

    const membersIds = members.items.map((m) => m.member_id);

    const summary = users
        .filter((u) => membersIds.includes(u.id)) // filter users so we get only this chat users
        .map<UserPoop>((m) => {
            const count = items.filter(
                (i) => i.userId == m.id && i.chatId == ctx.chatId
            ).length; // items from this chat and this user
            return {
                firstName: m.firstname,
                lastName: m.lastname,
                count
            };
        })
        .filter((u) => u);

    const sumStr = generateSummary(summary);
    ctx.send('💯 Анализ окончен 💯');
    ctx.send(sumStr);
}

async function onWeekReport(chatId: number) {
    const users = await getDBUsers();
    const items = await getDBItems();
    const members = await vk.api.messages.getConversationMembers({
        peer_id: 2000000000 + chatId,
        extended: 1
    });

    const newMembers = members.profiles.filter((m) => !users.some((u) => u.id == m.id));
    users.push(
        ...newMembers.map<User>((m) => ({
            id: m.id,
            firstname: m.first_name,
            lastname: m.last_name
        }))
    );
    await saveDBUsers(users);

    const membersIds = members.items.map((m) => m.member_id);

    const dateNow = new Date();
    const lastDay = set(lastDayOfWeek(dateNow, { weekStartsOn: 1 }), {
        hours: 23,
        minutes: 59,
        seconds: 59
    });
    const firstDay = subDays(lastDay, 7);
    console.log('First day', firstDay);
    console.log('Last day', lastDay);
    const summary = users
        .filter((u) => membersIds.includes(u.id)) // filter users so we get only this chat users
        .map<UserPoop>((m) => {
            const count = items.filter((i) => {
                const date = parseISO(i.createdAt);
                return (
                    i.userId == m.id &&
                    i.chatId == chatId &&
                    isWithinInterval(date, { start: firstDay, end: lastDay })
                );
            }).length; // items from this chat and this user
            return {
                firstName: m.firstname,
                lastName: m.lastname,
                count
            };
        })
        .filter((u) => u);
    const sum = generateSummary(summary);
    await vk.api.messages.send({
        peer_id: 2000000000 + chatId,
        message: 'А вот ваш отчет ребята',
        random_id: 0 // getRandomInt(0, 1000),
    });
    await vk.api.messages.send({
        peer_id: 2000000000 + chatId,
        message: sum,
        random_id: 0 // getRandomInt(0, 1000),
    });
}
async function handleWeekReport(ctx: MessageContext) {
    const chatReports = await getDBChatWeekReports();
    const foundIndex = chatReports.findIndex((c) => c.chatId == ctx.chatId);

    if (foundIndex != -1) { // unsubscribe from week reports
        console.log('Unsubscribe week report from chat: ', ctx.chatId);

        const jobIndex = cronJobs.findIndex((j) => j.chatId == ctx.chatId);
        if (jobIndex == -1) {
            console.error('Could not find job with chatId', ctx.chatId);
            return;
        }

        cronJobs[jobIndex].job.stop();
        cronJobs.splice(jobIndex, 1);
        await saveDBChatWeekReports(chatReports.filter((r) => r.chatId == ctx.chatId));
        await ctx.reply('Чат отписан от отчетов');
        return;
    }
    // subscribe to week reports
    console.log('Subscribe week report from chat: ', ctx.chatId);

    const job = CronJob.from({
        cronTime: '* * * * *', // '0 18 * * SUN',
        onTick: () => onWeekReport(ctx.chatId),
        timeZone: 'Europe/Moscow',
        start: true
    });

    cronJobs.push({ chatId: ctx.chatId, job });

    chatReports.push({ chatId: ctx.chatId, cronTime: '0 18 * * SUN' });
    await saveDBChatWeekReports(chatReports);

    await ctx.reply(
        'Чат подписан на отчеты. Отчеты будут присылаться каждое воскресенье в 18:00'
    );
}

function generateSummary(summary: UserPoop[]): string {
    var sumStr = summary.reduce<string>(
        (sum, s) =>
            sum +
            `🧻 Участник: ${s.lastName + ' ' + s.firstName}\n` +
            (s.count == 0
                ? `😔 Вообще не какол. Может запор?\n\n`
                : `💩 Покакол целых ${s.count} раз!\n\n`),
        ''
    );

    const best = [_.max(summary, (u) => u.count) as UserPoop];
    if (
        summary.some((s) => s.count == best[0].count && s.lastName !== best[0].lastName)
    ) {
        best.push(
            ...summary.filter(
                (u) => u.count == best[0].count && u.lastName !== best[0].lastName
            )
        );
    }
    const worst = [_.min(summary, (u) => u.count) as UserPoop];
    if (
        summary.some((s) => s.count == worst[0].count && s.lastName !== worst[0].lastName)
    ) {
        worst.push(
            ...summary.filter(
                (u) => u.count == worst[0].count && u.lastName !== worst[0].lastName
            )
        );
    }

    sumStr +=
        '\n📊 Статистика 📈\n' +
        `🥇 ${best.reduce((str, u) => `${str} ${u.firstName} `, '')}- ${
            best.length == 1 ? 'лучший обосрыш' : 'лучшие обосрыши'
        }! (${best[0].count})\n` +
        `🐢 ${worst.reduce((str, u) => `${str} ${u.firstName} `, '')} - ${
            worst.length == 1 ? 'старайся лучше' : 'старайтесь лучше'
        }! (${worst[0].count})`;
    return sumStr;
}

vk.updates.on('message_new', async (ctx, next) => {
    const members = await vk.api.messages.getConversationMembers({
        peer_id: ctx.peerId
    });
    switch (ctx.text) {
        case '/команды':
            const commands =
                `'+' => означает, что ты сходил в туалет\n` +
                `'/анализ' => узнать, кто сколько раз сходил в туалет и получить крутую статистику\n` +
                `'/недельный_отчет' => включить отчеты по воскресеньям`;
            ctx.send(commands);
            break;
        case '+':
            const sender = members.profiles.find((p) => p.id == ctx.senderId);
            const users = await getDBUsers();
            const oldUserIndex = users.findIndex((u) => u.id == sender.id);
            if (oldUserIndex == -1) {
                users.push({
                    id: sender.id,
                    firstname: sender.first_name,
                    lastname: sender.last_name
                });
                await saveDBUsers(users);
            }

            const items = await getDBItems();
            items.push({
                userId: sender.id,
                chatId: ctx.chatId,
                createdAt: formatISO(new Date())
            });
            await saveDBItems(items);

            const str = replies[getRandomInt(0, replies.length)];
            ctx.reply(str);
            break;
        case '/сруны':
            console.log(members);
            break;
        case '/анализ':
            await handleAnalyze(ctx);
            break;
        case '/недельный_отчет':
            await handleWeekReport(ctx);
            break;
        default:
            break;
    }
    return next();
});

async function main() {
    try {
        await fs.readFile(DB_USERS_FILE);
    } catch (error) {
        fs.writeFile(DB_USERS_FILE, JSON.stringify([]));
    }
    try {
        await fs.readFile(DB_FECES_FILE);
    } catch (error) {
        fs.writeFile(DB_FECES_FILE, JSON.stringify([]));
    }
    try {
        await fs.readFile(DB_JOBS_FILE);
    } catch (error) {
        fs.writeFile(DB_JOBS_FILE, JSON.stringify([]));
    }

    await loadWeekReportsCronJobs();

    console.log('Starting Poop bot...');
    vk.updates
        .start()
        .then(() => console.log('Poop bot started'))
        .catch((err) => console.log(err));
}

async function fetchConversationMessages(ctx: MessageContext) {
    var msgs: MessagesMessage[] = [];
    for (var i = 100; i <= Number.MAX_VALUE; i += 100) {
        const res = await vk.api.messages.getByConversationMessageId({
            peer_id: ctx.peerId,
            conversation_message_ids: Array(100)
                .fill(0)
                .map((_, j) => i - 100 + j + 1)
        });

        if (res.count == 0 && i > 300) break; // TODO: this is probably not a good solution. Hope someday i fix it
        msgs.push(...res.items);
    }
    // await fs.writeFile('messages_test.txt', msgs.map(m => m.conversation_message_id + ' | ' + m.text).join('\n'))
}

main();
