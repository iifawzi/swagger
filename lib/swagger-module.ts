import { INestApplication } from '@nestjs/common';
import {
  OpenAPIObject,
  SwaggerCustomOptionsLegacy,
  SwaggerDocumentOptions
} from './interfaces';
import { SwaggerScanner } from './swagger-scanner';
import { assignTwoLevelsDeep } from './utils/assign-two-levels-deep';
import { getGlobalPrefix } from './utils/get-global-prefix';
import { validatePath } from './utils/validate-path.util';
import * as jsyaml from 'js-yaml';
import {
  buildSwaggerHTML,
  buildSwaggerInitJS,
  swaggerAssetsAbsoluteFSPath
} from './swagger-ui';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestExpressApplication } from '@nestjs/platform-express';
import { processSwaggerOptions } from './utils/backward-compatilibity-layer';

export class SwaggerModule {
  public static createDocument(
    app: INestApplication,
    config: Omit<OpenAPIObject, 'paths'>,
    options: SwaggerDocumentOptions = {}
  ): OpenAPIObject {
    const swaggerScanner = new SwaggerScanner();
    const document = swaggerScanner.scanApplication(app, options);

    document.components = assignTwoLevelsDeep(
      {},
      config.components,
      document.components
    );

    return {
      openapi: '3.0.0',
      paths: {},
      ...config,
      ...document
    };
  }

  private static serveStatic(finalPath: string, app: INestApplication) {
    const httpAdapter = app.getHttpAdapter();

    if (httpAdapter && httpAdapter.getType() === 'fastify') {
      (app as NestFastifyApplication).useStaticAssets({
        root: swaggerAssetsAbsoluteFSPath,
        prefix: `${finalPath}/`,
        decorateReply: false
      });
    } else {
      (app as NestExpressApplication).useStaticAssets(
        swaggerAssetsAbsoluteFSPath,
        { prefix: finalPath }
      );
    }
  }

  private static serveDocuments(
    finalPath: string,
    app: INestApplication,
    swaggerInitJS: string,
    yamlDocument: string,
    jsonDocument: string,
    html: string
  ) {
    const httpAdapter = app.getHttpAdapter();

    httpAdapter.get(`${finalPath}/swagger-ui-init.js`, (req, res) => {
      res.type('application/javascript');
      res.send(swaggerInitJS);
    });

    httpAdapter.get(finalPath, (req, res) => {
      res.type('text/html');
      res.send(html);
    });

    // fastify compatibility
    httpAdapter.get(finalPath + '/', (req, res) => {
      res.type('text/html');
      res.send(html);
    });

    httpAdapter.get(`${finalPath}-json`, (req, res) => {
      res.type('text/json');
      res.send(jsonDocument);
    });

    httpAdapter.get(`${finalPath}-yaml`, (req, res) => {
      res.type('text/yaml');
      res.send(yamlDocument);
    });
  }

  public static setup(
    path: string,
    app: INestApplication,
    document: OpenAPIObject,
    options?: SwaggerCustomOptionsLegacy
  ) {
    const globalPrefix = getGlobalPrefix(app);
    const finalPath = validatePath(
      options?.useGlobalPrefix && globalPrefix && !globalPrefix.match(/^(\/?)$/)
        ? `${globalPrefix}${validatePath(path)}`
        : path
    );

    // START: fastify backward compatibility layer
    const { customOptions, extra } = processSwaggerOptions(options);
    // END: fastify backward compatibility layer

    const yamlDocument = jsyaml.dump(document);
    const jsonDocument = JSON.stringify(document);
    const html = buildSwaggerHTML(finalPath, document, customOptions);
    const swaggerInitJS = buildSwaggerInitJS(document, customOptions);

    SwaggerModule.serveDocuments(
      finalPath,
      app,
      swaggerInitJS,
      yamlDocument,
      jsonDocument,
      html
    );
    SwaggerModule.serveStatic(finalPath, app);
  }
}
