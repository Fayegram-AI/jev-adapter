/** JSON values are read-only because the adapter snapshots/freezes its boundaries. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type Entry = string | { readonly [key: string]: JsonValue } | readonly JsonValue[] | null;
export type State = Exclude<Entry, null>;
export type Instructions = State;
export type ChoiceCriteria = Readonly<Record<string, Entry>>;
export type ScoreCriteria = readonly [Instructions, Instructions, ...Instructions[]];
export interface ChoiceQuestion<C extends ChoiceCriteria = ChoiceCriteria> {
  readonly type: 'choice'; readonly instructions: Instructions; readonly criteria: C;
}
export interface NoulQuestion {
  readonly type: 'noul'; readonly instructions: Instructions;
  readonly criteria?: { readonly true?: Instructions; readonly false?: Instructions };
}
export interface ScoreQuestion<C extends ScoreCriteria = ScoreCriteria> {
  readonly type: 'score'; readonly instructions: Instructions; readonly criteria: C;
}
export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;
export type Questions = Readonly<Record<string, Question>>;
export interface ChoiceAnswer<K extends string = string> {
  readonly type: 'choice'; readonly choice: K;
  readonly probabilities: Readonly<Record<K, number>>;
  /** Present for Jev; never invented for generative backends. */
  readonly confidence?: number;
}
export interface NoulAnswer { readonly type: 'noul'; readonly noul: number; }
export interface ScoreAnswer {
  readonly type: 'score'; readonly score: number; readonly confidence?: number;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly legend: Readonly<Record<string, Entry>>;
}
type ChoiceLabel<K> = K extends string ? K : K extends number ? `${K}` : never;
export type AnswerFor<Q extends Question> = Q extends ChoiceQuestion<infer C>
  ? ChoiceAnswer<ChoiceLabel<keyof C>> : Q extends NoulQuestion ? NoulAnswer : ScoreAnswer;
export interface EvaluationRequest<Q extends Questions = Questions> {
  readonly state: State; readonly questions: Q; readonly model?: string;
}
export type ResolvedRequest<Q extends Questions = Questions> = EvaluationRequest<Q> & { readonly model: string };
export interface Usage {
  /** Null means not reported, not zero tokens. */
  readonly input_tokens: number | null; readonly output_tokens: number | null;
  readonly cache_creation_input_tokens?: number; readonly cache_read_input_tokens?: number;
}
export interface ProviderResult<Q extends Questions = Questions> {
  readonly model: string;
  readonly answers: { readonly [K in keyof Q]: AnswerFor<Q[K]> };
  readonly usage: Usage;
  readonly meta?: Readonly<Record<string, JsonValue>>;
}
export interface Metadata {
  readonly provider: string; readonly requestedModel: string;
  readonly probabilitySource: 'native' | 'elicited' | 'unspecified' | (string & {});
  readonly confidenceSource?: 'native' | 'unavailable' | (string & {});
  readonly modelSource?: 'reported' | 'requested';
  readonly adapterVersion: string; readonly schemaVersion: number;
  readonly totalDurationMs: number; readonly observerDurationMs: number;
  readonly observerFailures: readonly string[];
  readonly durationMs?: number; readonly attempts?: number; readonly requestId?: string;
  readonly [key: string]: unknown;
}
export type EvaluationResult<Q extends Questions = Questions> = Omit<ProviderResult<Q>, 'meta'> & { readonly meta: Metadata };
export interface ProviderCallOptions { signal?: AbortSignal; }
export interface CallOptions extends ProviderCallOptions { timeoutMs?: number; }
export interface ModelList {
  readonly models: readonly { readonly name: string; readonly description?: string;
    readonly release_date?: string; readonly [key: string]: unknown }[];
  readonly has_more?: boolean; readonly last_id?: string;
}
export interface DecisionProvider {
  readonly name: string; readonly defaultModel?: string; readonly probabilitySource?: string;
  evaluate(request: ResolvedRequest, options?: ProviderCallOptions): Promise<ProviderResult>;
  listModels?(options?: ProviderCallOptions): Promise<ModelList>;
}
export interface ExtensionContext {
  readonly provider: string; readonly model: string; readonly questionIds: readonly string[];
  readonly signal: AbortSignal;
}
export interface Extension {
  name: string;
  prepareState?(state: State, context: ExtensionContext): State | undefined | Promise<State | undefined>;
  /** Observer failure is isolated in meta.observerFailures; no inference is retried. */
  onResult?(result: EvaluationResult, context: ExtensionContext): void | Promise<void>;
}
export interface TransportOptions {
  timeoutMs?: number; maxRetries?: number; maxRequestBytes?: number; maxResponseBytes?: number;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}
export interface JevOptions extends TransportOptions { apiKey?: string; model?: string; baseURL?: string; }
export interface OpenAICompatibleOptions extends TransportOptions {
  /** Null explicitly disables authentication for loopback endpoints only. */
  apiKey?: string | null; model?: string; baseURL?: string;
  responseFormat?: 'json_schema' | 'json_object' | 'text';
  tokenParameter?: 'max_completion_tokens' | 'max_tokens';
  maxTokens?: number; parameters?: Readonly<Record<string, JsonValue>>;
}
export interface OpenRouterOptions extends Omit<OpenAICompatibleOptions, 'baseURL' | 'apiKey'> { apiKey?: string; }
export interface AnthropicOptions extends TransportOptions {
  apiKey?: string; model?: string; baseURL?: string; maxTokens?: number;
  parameters?: Readonly<Record<string, JsonValue>>;
}
export interface Adapter {
  readonly provider: string; readonly defaultModel?: string;
  evaluate<const Q extends Questions>(request: EvaluationRequest<Q>, options?: CallOptions): Promise<EvaluationResult<Q>>;
  listModels(options?: CallOptions): Promise<ModelList>;
}
export type AdapterOptions = { extensions?: readonly Extension[]; timeoutMs?: number; observerTimeoutMs?: number } & (
  { provider: DecisionProvider; jev?: never } | { provider?: undefined; jev?: JevOptions }
);
export function createAdapter(options?: AdapterOptions): Adapter;
export class JevProvider implements DecisionProvider {
  readonly name: string; readonly probabilitySource: 'native'; readonly defaultModel: string;
  constructor(options?: JevOptions);
  evaluate<const Q extends Questions>(request: EvaluationRequest<Q>, options?: ProviderCallOptions): Promise<ProviderResult<Q>>;
  listModels(options?: ProviderCallOptions): Promise<ModelList>;
}
export class OpenAICompatibleProvider implements DecisionProvider {
  readonly name: string; readonly probabilitySource: 'elicited'; readonly defaultModel?: string;
  constructor(options?: OpenAICompatibleOptions);
  evaluate<const Q extends Questions>(request: EvaluationRequest<Q>, options?: ProviderCallOptions): Promise<ProviderResult<Q>>;
  listModels(options?: ProviderCallOptions): Promise<ModelList>;
}
export class OpenRouterProvider extends OpenAICompatibleProvider { constructor(options?: OpenRouterOptions); }
export class AnthropicProvider implements DecisionProvider {
  readonly name: string; readonly probabilitySource: 'elicited'; readonly defaultModel?: string;
  constructor(options?: AnthropicOptions);
  evaluate<const Q extends Questions>(request: EvaluationRequest<Q>, options?: ProviderCallOptions): Promise<ProviderResult<Q>>;
  listModels(options?: ProviderCallOptions): Promise<ModelList>;
}
export type ProviderConfig = ({ type?: 'jev' } & JevOptions)
  | ({ type: 'openai-compatible' } & OpenAICompatibleOptions)
  | ({ type: 'openrouter' } & OpenRouterOptions)
  | ({ type: 'anthropic' } & AnthropicOptions);
export function createProvider(options?: ProviderConfig): DecisionProvider;
export function choice<const C extends ChoiceCriteria>(instructions: Instructions, criteria: C): ChoiceQuestion<C>;
export function noul(instructions: Instructions, criteria?: NoulQuestion['criteria']): NoulQuestion;
export function score<const C extends ScoreCriteria>(instructions: Instructions, criteria: C): ScoreQuestion<C>;
export interface ChoicePolicyOptions<K extends string = string> {
  minProbability: number; minMargin?: number; abstainOptions?: readonly K[];
}
export interface ChoiceDecision<K extends string = string> {
  readonly status: 'selected' | 'review'; readonly choice: K;
  readonly selectedProbability: number; readonly margin: number;
  readonly reason: null | 'abstain_option' | 'probability_below_threshold' | 'margin_below_threshold';
}
export function decideChoice<K extends string>(answer: ChoiceAnswer<K>, options: ChoicePolicyOptions<K>): ChoiceDecision<K>;
export interface ErrorDetails { code: string; message: string; status?: number; requestId?: string; attempts?: number; }
export class AdapterError extends Error {
  code: string; status?: number; requestId?: string; attempts?: number;
  constructor(message: string, details?: { code?: string; status?: number; requestId?: string; attempts?: number });
  toJSON(): ErrorDetails;
}
export function publicError(error: unknown): ErrorDetails;
export function validateRequest<const Q extends Questions>(input: EvaluationRequest<Q>, defaultModel?: string): ResolvedRequest<Q>;
export function validateRequest(input: unknown, defaultModel?: string): ResolvedRequest;
export function validateResult<const Q extends Questions>(input: unknown, questions: Q, options?: { native?: boolean }): ProviderResult<Q>;
export function buildResponseSchema(questions: Questions): Readonly<Record<string, JsonValue>>;
export type BatchRecord<Q extends Questions = Questions> =
  | { index: number; ok: true; result: EvaluationResult<Q> }
  | { index: number; ok: false; error: ErrorDetails };
export interface BatchOptions { concurrency?: number; signal?: AbortSignal; stopOnError?: boolean; }
export function evaluateBatch<const Q extends Questions>(adapter: Adapter, inputs: readonly EvaluationRequest<Q>[], options?: BatchOptions): Promise<BatchRecord<Q>[]>;
