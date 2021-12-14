import axios from "axios";
import { io } from "socket.io-client";
import { SocksProxyAgent } from "socks-proxy-agent";
// @ts-expect-error: no types
import randomUseragent from "random-useragent";
import * as child from "child_process";
import chalk from "chalk";

const socket = process.platform === "win32" ? io("ws://localhost:3000") : io("ws://autobuy:3000");
const ports = ["9050", "9052", "9053", "9054"];
let interv: NodeJS.Timeout;
let isInCart = false;

const log = (msg: string) => {
    const date = new Date();
    return console.log(`${chalk.yellow("[")}${date.toLocaleString()}:${date.getMilliseconds()}${chalk.yellow("]")} ` + chalk.greenBright(msg));
}

log(`${process.env.HOSTNAME!} Feeder is OK !`);

socket.on("connect", () => {
    log(`Connected with ${socket.id} !`);

    socket.on("cookies", (cookies) => {
        interv = setInterval(() => {
            if (!isInCart) {
                axios({
                    url: `https://ldlc.com/v4/fr-fr/cart/oneclick/add/offer/${process.env.CARD_AR}/1`,
                    httpsAgent: new SocksProxyAgent("socks5h://tor:" + ports[Math.floor(Math.random() * ports.length)]),
                    headers: {
                        "language": "en-US,en;q=0.9",
                        "x-requested-with": "XMLHttpRequest",
                        "User-Agent": randomUseragent.getRandom(),
                        "Cookie": `${cookies.customer.name}=${cookies.customer.value}; ${cookies.identity.name}=${cookies.identity.name}; ${cookies.session.name}=${cookies.session.value}`,
                    },
                }).then(async (rep) => {
                    if (rep.data && rep.status === 200) {
                        if (rep.data.status === "OK" && !isInCart) {
                            isInCart = true;
                            log(`${process.env.CARD_NAME} is in cart !`);
                            sendMsg(process.env.CARD_NAME!, true, 200);
                        }
                        else sendMsg(process.env.CARD_NAME!, false, 200);
                    }
                }).catch(async (err) => {
                    if (err.response && (err.response.status === 403 || err.response.status === 503)) {
                        sendMsg(process.env.CARD_NAME!, false, err.response.status);
                        if (err.response.status === 403) sh("killall -HUP tor");
                    } else {
                        log(`${chalk.redBright("Error not handled ! (Maybe Tor isn't launched)")}`)
                    }
                });
            }
        }, 3000);
    });
});

socket.on("buyStatus", (data) => {
    if(!data.buy && interv) clearInterval(interv);
});

const sendMsg = (card: string, buyable: boolean, err: number) => {
    log(`Message ${JSON.stringify({ card, buyable, err })} sent to the server ..`);
    socket.emit("cardMsg", JSON.stringify({ card, buyable, err }));
}

async function sh(cmd: string) {
    return new Promise((resolve, reject) => {
        child.exec(cmd, (err, stdout, stderr) => {
            err ? reject(err) : resolve({ stdout, stderr });
        });
    });
}
