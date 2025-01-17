import which from 'which';
import {
  $,
  exec as $exec,
  type ProcessOptions,
  defaultOptions
} from './process';
import { detectPackageManager } from './utils';

export class PackageManager {
  constructor(readonly name: string) {
    for (const key of Object.getOwnPropertyNames(
      PackageManager.prototype
    ) as (keyof PackageManager)[]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        PackageManager.prototype,
        key
      );

      if (descriptor && typeof descriptor.value === 'function') {
        const value = this[key];
        if (typeof value === 'function') {
          // @ts-ignore
          this[key] = value.bind(this);
        }
      }
    }
  }

  get realname(): string {
    return which.sync(this.name);
  }

  runCommand(): string {
    const name = this.name;

    if (this.in(['npm', 'cnpm', 'bun', 'deno'])) {
      return `${name} run${this.isDeno() ? ' -A' : ''}`;
    }

    return name;
  }

  in(names: string[]): boolean {
    return names.includes(this.name);
  }

  is(name: string): boolean {
    return this.name === name;
  }

  isNpm(): this is PackageManager & { name: 'npm' } {
    return this.is('npm');
  }

  isCnpm(): this is PackageManager & { name: 'cnpm' } {
    return this.is('cnpm');
  }

  isYarn(): this is PackageManager & { name: 'yarn' } {
    return this.is('yarn');
  }

  isPnpm(): this is PackageManager & { name: 'pnpm' } {
    return this.is('pnpm');
  }

  isBun(): this is PackageManager & { name: 'bun' } {
    return this.is('bun');
  }

  isDeno(): this is PackageManager & { name: 'deno' } {
    return this.is('deno');
  }

  async isInstalled(): Promise<boolean> {
    try {
      await this.version();
      return true;
    } catch (_) {
      return false;
    }
  }

  async version(): Promise<string> {
    return await $exec(`${this.realname} --version`);
  }

  async help(): Promise<string> {
    return await $exec(`${this.realname} --help`);
  }

  async $(args: string | string[], options: ProcessOptions = defaultOptions) {
    args = Array.isArray(args) ? args : [args];

    return $(this.realname, args, options).result;
  }

  async jsr(
    command: string,
    args: string[],
    options: ProcessOptions = defaultOptions
  ) {
    if (this.isDeno()) {
      args = args.map((arg) => this.toJsr(arg));

      switch (command) {
        case 'add':
        case 'install':
        case 'i':
          return this.$(['add', ...args], options);

        case 'remove':
        case 'uninstall':
        case 'r':
          return this.$(['uninstall', ...args], options);

        case 'run':
        case 'exec':
          return this.$(['run', '-A', ...args], options);

        case 'dlx':
        case 'x':
          return this.$(['run', '-A', '-r', ...args], options);

        default:
          return this.$([command, ...args], options);
      }
    }

    args = args.map((arg) => this.unJsr(arg));

    return this.$(
      `${this.in(['pnpm', 'yarn']) ? 'dlx' : 'x'} jsr ${['run', 'exec', 'dlx', 'x'].includes(command) ? 'run' : command} ${args.join(' ')}`,
      options
    );
  }

  isJsr(module: string): boolean {
    return module.startsWith('jsr:');
  }

  toJsr(module: string): string {
    return this.isJsr(module) ? module : `jsr:${module}`;
  }

  unJsr(module: string): string {
    return module.replace(/^jsr:/, '');
  }

  async install(options: ProcessOptions = defaultOptions) {
    return this.$('install', options);
  }

  async i(options: ProcessOptions = defaultOptions) {
    return this.install(options);
  }

  async create(app: string, options: ProcessOptions = defaultOptions) {
    let args = app.split(/\s+/);

    if (this.isDeno()) {
      const packageName = args[1];
      const parts = packageName.split('/', 2);
      const createCommand = parts[1]
        ? `npm:${parts[0]}/create-${parts[1]}`
        : `npm:create-${parts[0]}`;

      args = ['run', '-A', createCommand, ...args.slice(2)];
    } else {
      args = ['create', ...args];
    }

    return this.$(args, options);
  }

  async add(
    packages: string | string[],
    options: ProcessOptions = defaultOptions
  ) {
    packages = Array.isArray(packages) ? packages : packages.split(/\s+/);

    if (this.isJsr(packages[0])) {
      return this.jsrAdd(packages, options);
    }

    return this.isDeno()
      ? this.$(
          [
            'add',
            ...packages.map((pkg) =>
              pkg.startsWith('npm:') ? pkg : `npm:${pkg}`
            )
          ],
          options
        )
      : this.$(
          [
            this.isNpm() ? 'install' : 'add',
            ...packages.map((pkg) => pkg.replace(/^npm:/, ''))
          ],
          options
        );
  }

  async remove(
    packages: string | string[],
    options: ProcessOptions = defaultOptions
  ) {
    packages = Array.isArray(packages) ? packages : packages.split(/\s+/);

    if (this.isJsr(packages[0])) {
      return this.jsrRemove(packages, options);
    }

    return this.$(
      [this.isNpm() ? 'uninstall' : 'remove', ...packages],
      options
    );
  }

  async rm(
    packages: string | string[],
    options: ProcessOptions = defaultOptions
  ) {
    return this.remove(packages, options);
  }

  async uninstall(
    packages: string | string[],
    options: ProcessOptions = defaultOptions
  ) {
    return this.remove(packages, options);
  }

  async run(script: string, options: ProcessOptions = defaultOptions) {
    if (this.isJsr(script)) {
      return this.jsrRun(script, options);
    }

    const args = script.split(/\s+/);

    return this.in(['pnpm', 'yarn'])
      ? this.$(args, options)
      : this.$([this.isDeno() ? 'task' : 'run', ...args], options);
  }

  async task(script: string, options: ProcessOptions = defaultOptions) {
    return this.run(script, options);
  }

  async exec(command: string, options: ProcessOptions = defaultOptions) {
    if (this.isJsr(command)) {
      return this.jsrExec(command, options);
    }

    const args = command.split(/\s+/);

    return this.$(
      [
        ...(this.isDeno()
          ? ['run', '-A']
          : this.in(['pnpm', 'yarn'])
            ? ['exec']
            : ['x']),
        ...args
      ],
      options
    );
  }

  async dlx(binary: string, options: ProcessOptions = defaultOptions) {
    if (this.isJsr(binary)) {
      return this.jsrDlx(binary, options);
    }

    const args = binary.split(/\s+/);

    return this.$(
      [
        ...(this.isDeno()
          ? ['run', '-A', '-r']
          : this.in(['pnpm', 'yarn'])
            ? ['dlx']
            : ['x']),
        ...args
      ],
      options
    );
  }

  async x(executable: string, options: ProcessOptions = defaultOptions) {
    if (this.isJsr(executable)) {
      return this.jsrDlx(executable, options);
    }

    if (this.in(['deno', 'pnpm', 'yarn'])) {
      try {
        return this.exec(executable, options);
      } catch (e: any) {
        return this.dlx(executable, options);
      }
    }

    return this.$(['x', ...executable.split(/\s+/)], options);
  }

  async jsrAdd(packages: string[], options: ProcessOptions = defaultOptions) {
    return this.jsr('add', packages, options);
  }

  async jsrRemove(
    packages: string[],
    options: ProcessOptions = defaultOptions
  ) {
    return this.jsr('remove', packages, options);
  }

  async jsrRun(script: string, options: ProcessOptions = defaultOptions) {
    const args = script.split(/\s+/);

    return this.jsr('run', args, options);
  }

  async jsrExec(command: string, options: ProcessOptions = defaultOptions) {
    const args = command.split(/\s+/);

    return this.jsr('exec', args, options);
  }

  async jsrDlx(binary: string, options: ProcessOptions = defaultOptions) {
    const args = binary.split(/\s+/);

    return this.jsr('dlx', args, options);
  }

  async jsrX(executable: string, options: ProcessOptions = defaultOptions) {
    const args = executable.split(/\s+/);

    return this.jsr('x', args, options);
  }
}

export function pm(name: string): PackageManager {
  return new PackageManager(name);
}

const _pm: PackageManager = pm(detectPackageManager().name);

const [
  name,
  realname,
  install,
  i,
  create,
  add,
  remove,
  rm,
  uninstall,
  run,
  exec,
  dlx,
  x
] = [
  _pm.name,
  _pm.realname,
  _pm.install,
  _pm.i,
  _pm.create,
  _pm.add,
  _pm.remove,
  _pm.rm,
  _pm.uninstall,
  _pm.run,
  _pm.exec,
  _pm.dlx,
  _pm.x
];

export {
  name,
  realname,
  install,
  i,
  create,
  add,
  remove,
  rm,
  uninstall,
  run,
  exec,
  dlx,
  x
};

export default _pm;
