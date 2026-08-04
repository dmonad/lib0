# Telemetry

What is telemetry was a RDT?

- `opentelemetry/api`-like api (but cheap)
  - implement traces, metrics, and logs (with traces)
  - write OTEL data to different backends (the ingesting of OTEL is standardized)
- write data to other thread, like pino (write to ringbuffer sharedarraybuffer, Atomics to
guard access)
  - requires implementing a custom encoder (ringbuffer encoder/decoder)

## code

```js
import tel from 'lib0/telemetry'

/**
 * @param {import('lib0/telemetry').Telemetry} tel
 */
const myAsyncFunc = async tel => {
    await tel.spanAsync('myAsyncWork', async tel => {
        await someFun(tel)
        tel.log('still working')
    })
}

const myFunc = () => {
    tel.span('myFunc', { some: 'attr' }, tel => {
        // doing some calculations
        tel.log('this was called')
        tel.metric('calls').add(1)
    })
}
```

## api

- `tel.currentSpan`
- `tel.span()`
- `tel.spanAsync()`

## tel updates

## tel formt

- binary encoded
- optimized for merging (by only looking at traces) and containing lots of data
  efficiently in memory (without parsing what's not necessary)

- idea: we encode all trackes one after another. Duplicates are not allowed. at
  the end we encode all the "metadata" for efficient decoding (e.g. references
to strings that are used throughout)
  - decoding first only decodes the trace ids (and possibly some metadata like
  when the first span starts / ends).
  - we can decode trace data on-demand (e.g. when reading for visualization we
  get the nested representation, when decoding for merging we sort by time).
  - when encoding everything, we should encode by time

- representations:
  - binary format v1: efficient encoding, works over any encoder / decoder
  interface (unbuffered) (can be written without the stream format)
  - binary format v2: space efficient (derived from encoding using the trace
  representation)
  - decoded traces format (owns a buffer / encoder+decoder for decoding the data): A class. can read traces using a v1 / v2 decoder
    - decoded Trace: list of spans (filtering, merging of span information) + can be transformed to a delta
  - 
