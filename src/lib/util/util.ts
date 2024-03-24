import * as L from "leaflet"
import * as leaflet from "leaflet"
import {v4 as uuidv4} from 'uuid';
import * as lodash from "lodash";
import {levenshteinEditDistance} from "levenshtein-edit-distance";

export namespace util {

  export function natural_join(a: any[], connector: string = "and"): string {
    if (a.length == 0) return ""
    if (a.length == 1) return a.toString()
    if (a.length == 2) return `${a[0]} ${connector} ${a[1]}`

    return a.slice(0, -1).join(", ") + `, ${connector} ` + a[a.length - 1]
  }

  export function plural(n: number, word: string, postfix: string = "s"): string {
    let s = `${n} ${word}`

    if (n != 1) s += postfix

    return s
  }

  export namespace Order {

    export function natural_order(a: number, b: number): number {
      return a - b
    }

    export function comap<T, U>(cmp: (a: U, b: U) => number, f: (_: T) => U): (a: T, b: T) => number {
      return (a, b) => cmp(f(a), f(b))
    }

    export function reverse<T>(cmp: (a: T, b: T) => number): (a: T, b: T) => number {
      return (a, b) => -cmp(a, b)
    }

    export function chain<T>(...fs: ((a: T, b: T) => number)[]): (a: T, b: T) => number {
      return (a, b) => {
        for (let f of fs) {
          let r = f(a, b)
          if (r != 0) return r
        }

        return 0
      }
    }
  }


  export function capitalize(s: string): string {
    return s ? s[0].toUpperCase() + s.slice(1) : ""
  }

  /**
   * Helper function to easily allow negative indexing to access elements at the back of array
   */
  export function index<T>(array: T[], index: number): T {
    return array[(array.length + index) % array.length]
  }

  export type nArray<T> = T | nArray<T>[]

  export function multiIndex<T>(nArray: nArray<T>, ...indices: number[]): T {
    let x = nArray

    indices.forEach(i => {
      x = index((x as nArray<T>[]), i)
    })

    return x as T
  }


  export function minIndex(array: number[]): number {
    return array.indexOf(Math.min(...array))
  }

  export function shorten_integer_list(l: number[], f: ((_: number) => string) = (n => n.toString())): string[] {
    l.sort(Order.natural_order)

    let res: string[] = []

    let start_range = l[0]
    let last = start_range

    for (let i = 1; i < l.length; i++) {
      let n = l[i]

      if (n <= last + 1) last = n
      else {
        if (last == start_range) res.push(f(last))
        else if (last == start_range + 1) res.push(f(start_range), f(last))
        else res.push(`${f(start_range)} - ${f(last)}`)

        start_range = n
        last = n
      }
    }

    if (last == start_range) res.push(f(last))
    else if (last == start_range + 1) res.push(f(start_range), f(last))
    else res.push(`${f(start_range)} - ${f(last)}`)

    return res
  }

  export function convert_bounds(bounds: L.Bounds): L.LatLngBounds {
    return leaflet.latLngBounds([
      [bounds.getTopLeft().y, bounds.getTopLeft().x],
      [bounds.getBottomRight().y, bounds.getBottomRight().x],
    ])
  }

  export function compose<T>(fn1: (a: T) => T, ...fns: Array<(a: T) => T>) {
    return fns.reduce((prevFn, nextFn) => value => nextFn(prevFn(value)), fn1);
  }

  export function swap<A, B>(a: A, b: B): [B, A] {
    return [b, a]
  }

  export function count<A>(a: A[], p: (_: A) => boolean): number {
    return a.reduce((x, y) => x + (p(y) ? 1 : 0), 0)
  }

  /**
   * This generic type can be used to ensure a defined type is a subtype of another type statically.
   * I'm 99% percent sure this already exists in some way, but could not find it.
   */
  export type ensure_subtype<Supertype, T extends Supertype> = T

  export function signedToString(n: number): string {
    return `${Math.sign(n) < 0 ? "" : "+"}${n}`
  }

  export function tap<T>(v: T, ...fs: ((_: T) => void)[]): T {
    fs.forEach(f => f(v))

    return v
  }

  export function profile<T>(f: () => T, name: string = null): T {
    console.time(name || f.name)
    let res = f()
    console.timeEnd(name || f.name)

    return res
  }

  export async function profileAsync<T>(f: () => Promise<T>, name: string = null): Promise<T> {
    console.time(name || f.name)
    let res = await f()
    console.timeEnd(name || f.name)

    return res
  }

  export function avg(...ns: number[]): number {
    return ns.reduce((a, b) => a + b, 0) / ns.length
  }

  export function positiveMod(a: number, b: number): number {
    a += Math.ceil(Math.abs(a / b)) * b

    return a % b
  }

  export function uuid(): string {
    return uuidv4()
  }

  /**
   * @return The current utc time as a unix timestamp (in seconds)
   */
  export function timestamp(): number {
    return Math.floor((new Date()).getTime() / 1000)
  }

  export async function asyncFilter<T>(collection: T[], predicate: (_: T) => Promise<boolean>): Promise<T[]> {
    let filters = await Promise.all(collection.map(predicate))

    return collection.filter((e, i) => filters[i])
  }

  export function todo(): never {
    throw new Error("Not implemented.")
  }

  export function copyUpdate<T>(value: T, updater: (_: T) => void): T {
    const copy = lodash.cloneDeep(value)

    updater(copy)

    return copy
  }

  export function copyUpdate2<T>(value: T, updater: (_: T) => void): T {
    const copy = lodash.clone(value)

    updater(copy)

    return copy
  }

  export function cleanedJSON(value: any, space: number = undefined) {
    return JSON.stringify(value, (key, value) => {
      if (key.startsWith("_")) return undefined
      return value
    }, space)
  }

  export function eqWithNull<T>(f: (a: T, b: T) => boolean): (a: T, b: T) => boolean {
    return (a, b) => (a == b) || (a != null && b != null && f(a, b))
  }

  export function download(filename: string, text: string) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  export function stringSimilarity(a: string, b: string): number {
    return levenshteinEditDistance(a, b, false)
  }
}