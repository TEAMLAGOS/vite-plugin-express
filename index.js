import { globby } from 'globby';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { resolve } from 'path';
const arePathsDifferent = (target, source) => {
    if (target.length !== source.length) {
        return true;
    }
    if (target.length === 0) {
        return false;
    }
    return !target.every((path) => source.indexOf(path) >= 0);
};
const startApp = async (server, options, existingApp) => {
    if (existingApp && "close" in existingApp && typeof (existingApp.close) === "function") {
        existingApp.close();
    }
    const app = express();
    const { middlewareFiles, prefixUrl = '/api', defaultMiddlewares, port } = options;
    if (defaultMiddlewares) {
        defaultMiddlewares.forEach((middleware) => {
            app.use(prefixUrl, middleware);
        });
    }
    else {
        app.get(prefixUrl, cors());
        app.use(prefixUrl, bodyParser.json());
        app.use(prefixUrl, (req, res, next) => {
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');
            next();
        });
    }
    const paths = (await globby(middlewareFiles)).map((path) => resolve(process.cwd(), path));
    await Promise.all(paths.map(async (path) => {
        app.use(prefixUrl, (await server.ssrLoadModule(path)).default);
    }));
    if (options.port) {
        app.listen(port, () => { console.log(`Listening on port ${port}...`); });
        return { newApp: app, newPaths: paths };
    }
    else {
        return { newApp: app, newPaths: paths };
    }
};
export default (options) => {
    let app;
    if (options.port) {
        let newApp = express();
        app = newApp;
    }
    else {
        let newApp = (req, res, next) => next();
        app = newApp;
    }
    let paths = [];
    return {
        name: 'vite:middleware',
        apply: 'serve',
        configureServer: (server) => {
            if (!options.port) {
                server.middlewares.use((req, res, next) => app(req, res, next));
            }
            return async () => {
                const { newApp, newPaths } = await startApp(server, options, app);
                app = newApp;
                paths = newPaths;
                server.watcher.on('all', async (eventName, path) => {
                    if (eventName === 'add') {
                        const { newApp, newPaths } = await startApp(server, options, app);
                        if (arePathsDifferent(paths, newPaths)) {
                            app = newApp;
                            paths = newPaths;
                        }
                    }
                    if (eventName === 'change' && paths.indexOf(path) >= 0) {
                        const { newApp } = await startApp(server, options, app);
                        app = newApp;
                    }
                });
            };
        }
    };
};
//# sourceMappingURL=index.js.map