import * as classTransformer from 'class-transformer'
import * as classValidator from 'class-validator'
import * as fs from 'fs'
import { archivist } from 'mage'
import * as mage from 'mage'
import * as path from 'path'

const functionArguments = require('function-arguments')

import 'reflect-metadata'

import * as classValidatorError from 'class-validator/validation/ValidationError'

/**
 * Validation error classes
 *
 * Will contain all the validation errors that were found upon validation.
 *
 * @export
 * @class ValidationError
 * @extends {Error}
 */
export class ValidationError extends Error {
  public details: any[]

  constructor(message: string, details: any) {
    super(message)
    this.details = details
    this.name = 'ValidationError'
  }
}

/**
 * Log emergency and crash
 *
 * @param {string} message
 * @param {*} data
 */
function crash(message: string, data: any) {
  mage.logger.emergency.data(data).log(message)
  return new Error(message)
}

/**
 * Throw only if the error is not "file/folder not found"
 *
 * @param {NodeJS.ErrnoException} error
 */
function throwIfNotFileNotFoundError(error: NodeJS.ErrnoException) {
  if (error.code !== 'ENOENT') {
    throw error
  }
}

/**
 * Throw on validation if at least one error is found
 *
 * @param {Error[]} errors
 * @param {*} obj
 * @returns
 */
function throwOnError(message: string, errors: classValidatorError.ValidationError[], obj?: any) {
  if (errors.length > 0) {
    throw new ValidationError(message, errors)
  }

  return obj
}

/**
 * usercommand.execute function signature
 *
 * @export
 * @interface IExecuteFunction
 */
type IExecuteFunction = <T>(state: mage.core.IState, ...args: any[]) => Promise<T>

/**
 * Load topics from each module's 'topics' folder
 *
 * This function is a helper you will use in your project's
 * `lib/archivist/index.js` file, as follow:
 *
 * ```typescript
 * import { loadTopicsFromModules } from 'mage-validator'
 *
 * loadTopicsFromModules(exports)
 * ```
 *
 * This will:
 *
 *   - Find all your projetc's modules
 *   - For each module folders, check if there is a `topics` folder
 *   - When a `topics` folder is found, require each file in it
 *   - Add the content of the require to exports[fileNameWithoutJSExtension]
 *
 * @export
 * @param {*} exports
 */
export function loadTopicsFromModules(exports: any) {
  const modules = mage.listModules()
  for (const moduleName of modules) {
    loadTopicsFromModule(exports, moduleName)
  }
}

/**
 * Load topics defined in a single module
 *
 * @param {*} exports
 * @param {string} moduleName
 */
export function loadTopicsFromModule(archivistExports: any, moduleName: string) {
  const modulePath = mage.getModulePath(moduleName)
  const moduleTopicsPath = path.join(modulePath, 'topics')

  try {
    fs.readdirSync(moduleTopicsPath).forEach(function (topicFileName) {
      const topicPath = path.join(moduleTopicsPath, topicFileName)
      const topicPathInfo = path.parse(topicPath)
      const topicName = topicPathInfo.name

      // Skip all files but TypeScript source files
      if (topicPathInfo.ext !== '.ts') {
        return
      }

      if (archivistExports[topicName]) {
        throw crash('Topic is already defined!', {
          alreadySetByModule: archivistExports[topicName]._module,
          module: moduleName,
          topic: topicName,
        })
      }

      // Add topic to the export of lib/archivist/index.ts
      archivistExports[topicName] = require(topicPath).default
      archivistExports[topicName]._module = moduleName
    })
  } catch (error) {
    throwIfNotFileNotFoundError(error)
  }
}

/**
 * Validated topic
 *
 * Please note that you should import the default
 * of this module, not this class directly.
 *
 * Good:
 *
 * ```typescript
 * import ValidatedTopic from 'mage-validator'
 * ```
 *
 * Bad:
 *
 * ```typescript
 * import { ValidatedTopic } from 'mage-validator'
 * ```
 *
 * While the second line will work, it will provide you with
 * less type safety than the first import example.
 *
 * @export
 * @abstract
 * @class ValidatedTopic
 */
export class ValidatedTopic {
  public static readonly index: string[]
  public static readonly indexType: any
  public static readonly vaults = {}

  /**
   * Return the current class
   *
   * @static
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static getClass() {
    return this
  }

  /**
   * Return the current class name
   *
   * @static
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static getClassName(): string {
    /* istanbul ignore next */
    return this.toString().split ('(' || /s+/)[0].split (' ' || /s+/)[1]
  }

  /**
   * Create an instance from a generic object
   *
   * @static
   * @param {mage.core.IState} state
   * @param {*} data
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async create(state: mage.core.IState, index: archivist.IArchivistIndex, data?: any): Promise<any> {
    const classInstance = this.getClass()
    let instance

    if (data) {
      instance = classTransformer.plainToClass<ValidatedTopic, object>(classInstance, data)
    } else {
      instance = new classInstance()
    }

    instance.setState(state)
    await instance.setIndex(index)

    return instance
  }

  /**
   * Utility method used to promisify archivist calls
   *
   * @static
   * @param {*} state
   * @param {*} method
   * @param {any[]} args
   * @param {Function} run
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async execute(state: any, method: any, args: any[], run: (data: any) => any): Promise<any> {
    return new Promise((resolve, reject) => {
      state.archivist[method](...args, (error: any, data: any) => {
        if (error) {
          return reject(error)
        }

        resolve(run(data))
      })
    })
  }

  /**
   * Get a topic instance from backend vault(s)
   *
   * Mostly a wrapper around state.archivist.get.
   *
   * @static
   * @param {mage.core.IState} state
   * @param {archivist.IArchivistIndex} index
   * @param {archivist.IArchivistGetOptions} [options]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async get(state: mage.core.IState, index: archivist.IArchivistIndex, options?: archivist.IArchivistGetOptions): Promise<any> {
    const topicName = this.getClassName()

    return this.execute(state, 'get', [
      topicName,
      index,
      options
    ], async (data: any) => this.create(state, index, data))
  }

  /**
   * Get instances from backend vault(s)
   *
   * Mostly a wrapper around state.archivist.mget.
   *
   * @static
   * @param {mage.core.IState} state
   * @param {archivist.IArchivistQuery[]} queries
   * @param {archivist.IArchivistGetOptions} [options]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async mget(state: mage.core.IState, indexes: archivist.IArchivistIndex[], options?: archivist.IArchivistGetOptions): Promise<any[]> {
    const topic = this.getClassName()
    const queries: archivist.IArchivistQuery[] = indexes.map((index) => ({ topic, index }))

    return this.execute(state, 'mget', [
      queries,
      options
    ], async (list: any) => {
      const instances = []

      for (let d = 0; d < list.length; d += 1) {
        const data = list[d]
        const index = queries[d].index
        const instance = await this.create(state, index, data)

        instances.push(instance)
      }

      return instances
    })
  }

  //
  // Todo:
  //
  // public static async mget(state: mage.core.IState, queries: archivist.INamedArchivistQuery, options?: archivist.IArchivistGetOptions) {
  //   return new Promise((resolve, reject) => {
  //     state.archivist.mget(queries, options, async (error, list) => {
  //       if (error) {
  //         return reject(error)
  //       }

  //       const instances = Object.keys(list).reduce((instances, name) => {
  //         if (list[name]) {
  //           instances[name] = this.create(state, queries[name], list[name])
  //         }

  //         return instances
  //       }, {})

  //       resolve(instances)
  //     })
  //   })
  // }

  /**
   * List all keys
   *
   * @static
   * @param {mage.core.IState} state
   * @param {archivist.IArchivistIndex} partialIndex
   * @param {archivist.IArchivistGetOptions} [options]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async list(state: mage.core.IState, partialIndex: archivist.IArchivistIndex, options?: archivist.IArchivistListOptions) {
    const topicName = this.getClassName()

    return this.execute(state, 'list', [
      topicName,
      partialIndex,
      options,
    ], (indexes: archivist.IArchivistIndex[]) => indexes)
  }

  /**
   * Query data by partial index
   *
   * Essentially wraps state.archivist.list, then fetches the data
   * for each keys using state.archivist.mget.
   *
   * @static
   * @param {mage.core.IState} state
   * @param {archivist.IArchivistIndex} partialIndex
   * @param {archivist.IArchivistGetOptions} [options]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public static async query(state: mage.core.IState, partialIndex: archivist.IArchivistIndex, options?: archivist.IArchivistGetOptions) {
    const topicName = this.getClassName()

    return this.execute(state, 'list', [
      topicName,
      partialIndex
    ], async (indexes: archivist.IArchivistIndex[]) => {
      return this.mget(state, indexes, options)
    })
  }

  /**
   * Creates an instance of ValidatedTopic.
   *
   * @param {mage.core.IState} state
   *
   * @memberof ValidatedTopic
   */
  constructor(state?: mage.core.IState) {
    Object.defineProperty(this, '_topic', {
      value: this.constructor.name
    })

    if (state) {
      this.setState(state)
    }
  }

  /**
   * Get the topic for this instance
   *
   * @memberof ValidatedTopic
   */
  public getTopic() {
    return <string> (<any> this)._topic
  }

  /**
   * Get the topic of that instance
   *
   * Should always return the class name of the instance.
   *
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public getIndex() {
    return <archivist.IArchivistIndex> (<any> this)._index
  }

  /**
   * Set the index of this topic instance
   *
   * @param {archivist.IArchivistIndex} index
   *
   * @memberof ValidatedTopic
   */
  public async setIndex(indexData: archivist.IArchivistIndex) {
    const Class: any = this.constructor
    const Index = Class.indexType
    const index = new Index()

    for (const field of Class.index) {
      index[field] = indexData[field]
    }

    await classValidator.validate(index).then((errors) => throwOnError('Invalid index', errors))

    Object.defineProperty(this, '_index', {
      value: index
    })
  }

  /**
   * Retrieve the state object attached to the instance
   *
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public getState() {
    return <mage.core.IState> (<any> this)._state
  }

  /**
   * Set the state this topic instance will be using.
   *
   * @param {mage.core.IState} state
   *
   * @memberof ValidatedTopic
   */
  public setState(state: mage.core.IState) {
    Object.defineProperty(this, '_state', {
      value: state
    })
  }

  /**
   * Retrieve the actual data for this instance
   *
   * This should essentially be the same as simply accessing data on the
   * instance itself.
   *
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public getData() {
    return this
  }

  /**
   * Record an add operation on the instance's state
   *
   * Essentially a wrapper for state.archivist.add
   *
   * @param {archivist.ArchivistMediaType} mediaType
   * @param {archivist.ArchivistEncoding} encoding
   * @param {number} [expirationTime]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public async add(mediaType: archivist.ArchivistMediaType, encoding: archivist.ArchivistEncoding, expirationTime?: number) {
    await this.validate()
    return this.getState().archivist.add(this.getTopic(), this.getIndex(), this.getData(), mediaType, encoding, expirationTime)
  }

  /**
   * Record a set operation on the instance's state
   *
   * Essentially a wrapper for state.archivist.set.
   *
   * @param {archivist.ArchivistMediaType} mediaType
   * @param {archivist.ArchivistEncoding} encoding
   * @param {number} [expirationTime]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public async set(mediaType: archivist.ArchivistMediaType, encoding: archivist.ArchivistEncoding, expirationTime?: number) {
    await this.validate()
    return this.getState().archivist.set(this.getTopic(), this.getIndex(), this.getData(), mediaType, encoding, expirationTime)
  }

  /**
   * Record a touch operation on the instance's state
   *
   * Essentially a wrapper for state.archivist.touch.
   *
   * @param {number} [expirationTime]
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public async touch(expirationTime?: number) {
    await this.validate()
    return this.getState().archivist.touch(this.getTopic(), this.getIndex(), expirationTime)
  }

  /**
   * Record a delete operation on the instance's state
   *
   * @returns
   *
   * @memberof ValidatedTopic
   */
  public del() {
    return this.getState().archivist.del(this.getTopic(), this.getIndex())
  }

  /**
   * Validate the current instance
   *
   * @returns {Promise<classValidatorError.ValidationError[]>}
   *
   * @memberof ValidatedTopic
   */
  public async validate(): Promise<classValidatorError.ValidationError[]> {
    return classValidator.validate(this).then((errors) => throwOnError('Invalid type', errors))
  }
}

/**
 * @Acl decorator
 *
 * Protect the user command with the given ACL and defined type validation
 *
 * @export
 * @param {...string[]} acl
 * @returns
 */
export function Acl(...acl: string[]) {
  return function (UserCommand: any, key: string) {
    if (key !== 'execute') {
      throw crash('@validate only works for usercommand.execute functions', {
        method: key,
        userCommand: UserCommand
      })
    }

    UserCommand.acl = acl

    const execute = <IExecuteFunction> UserCommand.execute
    const parameterNames = functionArguments(execute)
    const types = Reflect.getMetadata('design:paramtypes', UserCommand, key)

    function validateObject(message: string, obj: any) {
      if (typeof obj === 'object') {
        return classValidator.validate(obj).then((errors) => throwOnError(message, errors, obj))
      }

      return obj
    }

    return {
      value: async (state: mage.core.IState, ...args: any[]) => {
        // Create an instance of UserCommand which we will
        // use to validate parameters
        const userCommand = new UserCommand()

        // Cast parameters
        const casted = await Promise.all(args.map(async (arg, pos) => {
          const realPos = pos + 1
          const parameterName = parameterNames[realPos]
          const type = types[realPos]
          let instance

          // If the parameter type is an instance of ValidatedTopic,
          // we automatically use the state to instanciate; otherwise,
          // we use a normal plainToClass call
          if (arg && type.prototype instanceof ValidatedTopic) {
            const index = arg.index || {}
            delete arg.index
            instance = await type.create(state, index, arg)
          } else {
            instance = classTransformer.plainToClass(type, arg)
          }

          userCommand[parameterName] = instance

          return instance
        }))

        // Validate parameters
        await validateObject('Invalid user command input', userCommand)

        // Execute the actual user command
        const output = await execute(state, ...casted)

        // Validate the returned value
        return await validateObject('Invalid user command return value', output)
      }
    }
  }
}
