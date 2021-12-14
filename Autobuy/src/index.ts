import "dotenv/config";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Client, ColorResolvable, Intents, MessageEmbed, TextChannel } from "discord.js";
import { Server } from "socket.io";
import chalk from "chalk";

puppeteer.use(StealthPlugin());
puppeteer.use(require("puppeteer-extra-plugin-block-resources")({
    blockedTypes: new Set(["image", "stylesheet", "font"]),
}));

const io = new Server(3000);
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

let total403 = 0;
let total503 = 0;
let totalRequests = 0;
let autoBuy = true;

launchBrowser().then((page) => {
    io.on("connection", async (socket) => {
        socket.on("cardMsg", async (msg) => {
            const content = JSON.parse(msg);
            log(`Message received from ${socket.id}`);

            content.err !== 200 ? content.err === 403 ? ++total403 : ++total503 : ++totalRequests;

            if (content.buyable && autoBuy) {
                log("Autobuy lauched");
                io.emit("buyStatus", { buy: false });
                autoBuy = false;
                await page.goto("https://secure2.ldlc.com/fr-fr/DeliveryPayment", { waitUntil: "load", timeout: 30000 });

                if (page.url().includes("Cart")) {
                    await page.evaluate(() => (document.querySelector(".cart-content aside .button.maxi")! as HTMLElement).click(), ".cart-content aside .button.maxi");
                    await page.waitForTimeout(2000);

                    if (page.url() !== "https://secure2.ldlc.com/fr-fr/DeliveryPayment") {
                        await Promise.all([
                            page.evaluate(() => (document.querySelector(".pack-off a")! as HTMLElement).click(), ".pack-off a"),
                            page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }),
                        ]);
                    }
                }

                await page.type("#CardNumber", process.env.CB_NUM!);
                await page.type("#ExpirationDate", process.env.CB_DATE!);
                await page.type("#OwnerName", process.env.CB_NAME!);

                const guild = await client.guilds.fetch("831800859322744833");
                const channel = <TextChannel>guild.channels.resolve("849905894606766120")!;
                channel.send(`<@253218664235401216> CCV for ${content.card} ...`);
                const filter = (m: any) => m.author.id === "253218664235401216";
                channel.awaitMessages({ filter, max: 4, time: 120000, errors: ['time'] }).then(async collected => {
                    await page.type("#Cryptogram", collected.first()!.content);
                    try {
                        await Promise.all([
                            page.evaluate(() => (document.querySelector(".payment .payment-form .action .button") as HTMLElement).click(), ".payment .payment-form .action .button"),
                            page.waitForNavigation({ waitUntil: "networkidle0" }),
                        ]);
                        channel.send(`<@253218664235401216> Completed ...`);
                        log(`Purchase of ${content.card} successfull !`);
                    } catch (err) {
                        log(`${chalk.redBright(`Error while confirming the purchase !\n${err}`)}`);
                    }
                }).catch(() => log(`${chalk.redBright("CCV wasn't entered in the 1m delay")}`));
            }
        });
    });
});

async function launchBrowser() {
    const browser = process.platform === "win32" ? await puppeteer.launch({ headless: true }) : await puppeteer.launch({ headless: true, executablePath: "/usr/bin/chromium-browser", args: ["--no-sandbox"] });
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", {
            get: () => false,
        });
    });

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:53.0) Gecko/20100101 Firefox/53.0");
    await page.setJavaScriptEnabled(true);
    page.setDefaultNavigationTimeout(0);

    await page.goto("https://secure2.ldlc.com/fr-fr/Login/Login?returnUrl=%2Ffr-fr%2FAccount", { waitUntil: "load", timeout: 0 });

    await page.type("#Email", process.env.LDLC_USER!);
    await page.type("#Password", process.env.LDLC_PWD!);

    await Promise.all([
        page.click(".identification .identification-form .button[type=submit]"),
        page.waitForNavigation({ waitUntil: "networkidle0" }),
    ]);

    const isLogged = await page.evaluate(() => document.querySelector(".logged"))
    if (isLogged) {
        log("Logged in on LDLC");
        const cookies = await page.cookies();
        io.emit("cookies", { identity: { name: cookies[0].name, value: cookies[0].value }, customer: { name: cookies[1].name, value: cookies[1].value }, session: { name: cookies[3].name, value: cookies[3].value } });
        return page;
    } else {
        log(`${chalk.redBright("Can't login on LDLC exiting ...")}`);
        process.exit(1);
    }
}

const log = (msg: string) => {
    const date = new Date();
    return console.log(`${chalk.yellow("[")}${date.toLocaleString()}:${date.getMilliseconds()}${chalk.yellow("]")} ` + chalk.greenBright(msg));
}

client.login(process.env.TOKEN!);

client.on("ready", async () => {
    const data = {
        name: "total",
        description: "Total of successfull and unsuccessfull requests sent to LDLC since reboot",
    };
    const fetchedGuild = await client.guilds.fetch("831800859322744833");
    fetchedGuild.commands.create(data);

    log(`Logged in on Discord`);
});

client.on("interaction", async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === "total") {
        const embedTotal = new MessageEmbed()
            .setDescription(`Total of **successfull** requests since reboot : **${totalRequests}**\nTotal of **unsuccessfull** requests since reboot : **${total503 + total403}**\n- 403: **${total403}**\n- 503: **${total503}**\nPercent of successfull requests : **${Math.floor((totalRequests * 100) / (totalRequests + (total503 + total403)))}%**`)
            .setColor(("#" + Math.floor(Math.random() * 16777215).toString(16)) as ColorResolvable);
        return interaction.reply({ embeds: [embedTotal] });
    }
});
