import { MessagesMessage } from "vk-io/lib/api/schemas/objects";
import { VK } from "vk-io";
import _ from "underscore";
import fs from "fs/promises";
require("dotenv").config();

interface UserHistory {
	name: string;
	id: number;
	count: number;
}
interface UserPoop {
	firstName: string;
	lastName: string;
	count: number;
}

const vk = new VK({
	token: process.env.TOKEN,
});

const replies = [
	"С облегчением!",
	"Не забыл(-а) смыть?",
	"Опусти стульчак!",
	"Молодец!",
	"Умничка!",
	"Неожидал...",
];
function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min)) + min; //Максимум не включается, минимум включается
}

vk.updates.on("message_new", async (ctx) => {
	const members = await vk.api.messages.getConversationMembers({
		peer_id: ctx.peerId,
	});
	switch (ctx.text) {
		case "+":
			const sender = members.profiles.find((p) => p.id == ctx.senderId);
			const str = replies[getRandomInt(0, replies.length)];
			ctx.reply(str);
			break;
		case "/сруны":
			console.log(members);
			// ctx.send()
			break;
		case "/анализ":
      await ctx.setActivity();
			ctx.send("🚽 Анализирую ваши туалеты... 🕜");
			var msgs: MessagesMessage[] = [];
			for (var i = 100; i <= Number.MAX_VALUE; i += 100) {
				const res = await vk.api.messages.getByConversationMessageId({
					peer_id: ctx.peerId,
					conversation_message_ids: Array(100)
						.fill(0)
						.map((_, j) => i - 100 + j + 1),
				});

				if (res.count == 0) break;
				msgs.push(...res.items);
			}
      // await fs.writeFile('messages_test.txt', msgs.map(m => m.conversation_message_id + ' | ' + m.text).join('\n'))

			ctx.send("💯 Онализ окончен 💯");

			const summary = members.items
				.map<UserPoop>((m) => {
					if (m.member_id < 0) return;

					const profile = members.profiles.find((p) => p.id == m.member_id);
					if (!profile) {
						console.log("ошибка");
						return;
					}
					const count =
						msgs.filter((msg) => msg.from_id == m.member_id && msg.text === "+")
							.length;

					return {
						firstName: profile.first_name,
						lastName: profile.last_name,
						count,
					};
				})
				.filter((u) => u);

			var sumStr = summary.reduce<string>(
				(sum, s) =>
					sum +
					`🧻 Участник: ${s.lastName + " " + s.firstName}\n` +
					(s.count == 0
						? `😔 Вообще не какол. Может запор?\n\n`
						: `💩 Покакол целых ${s.count} раз!\n\n`),
				""
			);

			const best = [_.max(summary, (u) => u.count) as UserPoop];
			if (
				summary.some(
					(s) => s.count == best[0].count && s.lastName !== best[0].lastName
				)
			) {
				best.push(
					...summary.filter(
						(u) => u.count == best[0].count && u.lastName !== best[0].lastName
					)
				);
			}
			const worst = [_.min(summary, (u) => u.count) as UserPoop];
			if (
				summary.some(
					(s) => s.count == worst[0].count && s.lastName !== worst[0].lastName
				)
			) {
				worst.push(
					...summary.filter(
						(u) => u.count == worst[0].count && u.lastName !== worst[0].lastName
					)
				);
			}

			sumStr +=
				"\n📊 Статистика 📈\n" +
				`🥇 ${best.reduce((str, u) => `${str} ${u.firstName} `, "")}- ${
					best.length == 1 ? "лучший обосрыш" : "лучшие обосрыши"
				}! (${best[0].count})\n` +
				`🐢 ${worst.reduce((str, u) => `${str} ${u.firstName} `, "")} - ${
					worst.length == 1 ? "старайся лучше" : "старайтесь лучше"
				}! (${worst[0].count})`;

			ctx.send(sumStr);
			break;
		default:
			console.log(ctx.text);
			break;
	}
});

// getMsgs()

console.log("Starting Poop bot...")
vk.updates.start().then(() => console.log("Poop bot started")).catch((err) => console.log(err));
// async function run() {

// }

// run().catch(console.log);
