/** Router mínimo: rutas con parámetros (/api/users/:id) y cadena de manejadores. */
export class Router {
  #routes = [];

  add(method, path, ...handlers) {
    const keys = [];
    const pattern = path.replace(/:([A-Za-z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.#routes.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handlers });
    return this;
  }
  get = (p, ...h) => this.add('GET', p, ...h);
  post = (p, ...h) => this.add('POST', p, ...h);
  put = (p, ...h) => this.add('PUT', p, ...h);
  patch = (p, ...h) => this.add('PATCH', p, ...h);
  delete = (p, ...h) => this.add('DELETE', p, ...h);

  match(method, pathname) {
    for (const route of this.#routes) {
      if (route.method !== method) continue;
      const m = route.re.exec(pathname);
      if (m) {
        const params = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handlers: route.handlers, params };
      }
    }
    return null;
  }
}

export const ok = (body) => ({ status: 200, body });
export const created = (body) => ({ status: 201, body });
export const noContent = () => ({ status: 204 });
