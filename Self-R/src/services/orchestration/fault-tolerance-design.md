// JokeOrchestrationService.cs
using System;
using System.Threading.Tasks;
using Grpc.Core;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

public class JokeOrchestrationService : JokeService.JokeServiceBase
{
    private readonly ILogger<JokeOrchestrationService> _logger;
    private readonly IContentCorpusClient _contentCorpusClient;
    private readonly IPersonalizationEngineClient _personalizationEngineClient;
    private readonly IComplianceClient _complianceClient;
    private readonly IKafkaProducer _kafkaProducer;
    private readonly ITemporalWorkflowClient _temporalClient;

    // Circuit Breaker Policies
    private readonly AsyncCircuitBreakerPolicy _contentCorpusCircuitBreaker;
    private readonly AsyncCircuitBreakerPolicy _personalizationCircuitBreaker;
    private readonly AsyncCircuitBreakerPolicy _complianceCircuitBreaker;

    // Retry Policies with Exponential Backoff
    private readonly AsyncRetryPolicy _retryPolicy;

    public JokeOrchestrationService(
        ILogger<JokeOrchestrationService> logger,
        IContentCorpusClient contentCorpusClient,
        IPersonalizationEngineClient personalizationEngineClient,
        IComplianceClient complianceClient,
        IKafkaProducer kafkaProducer,
        ITemporalWorkflowClient temporalClient)
    {
        _logger = logger;
        _contentCorpusClient = contentCorpusClient;
        _personalizationEngineClient = personalizationEngineClient;
        _complianceClient = complianceClient;
        _kafkaProducer = kafkaProducer;
        _temporalClient = temporalClient;

        // Circuit Breaker Configuration
        _contentCorpusCircuitBreaker = Policy
            .Handle<RpcException>()
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: 3,
                durationOfBreak: TimeSpan.FromSeconds(30),
                onBreak: (ex, breakDelay) => _logger.LogWarning($"Content Corpus Circuit broken! No calls for {breakDelay.TotalSeconds}s. Exception: {ex.Message}"),
                onReset: () => _logger.LogInformation("Content Corpus Circuit reset!"),
                onHalfOpen: () => _logger.LogInformation("Content Corpus Circuit half-open; next call is a trial."));

        _personalizationCircuitBreaker = Policy
            .Handle<RpcException>()
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: 3,
                durationOfBreak: TimeSpan.FromSeconds(30),
                onBreak: (ex, breakDelay) => _logger.LogWarning($"Personalization Circuit broken! No calls for {breakDelay.TotalSeconds}s. Exception: {ex.Message}"),
                onReset: () => _logger.LogInformation("Personalization Circuit reset!"),
                onHalfOpen: () => _logger.LogInformation("Personalization Circuit half-open; next call is a trial."));

        _complianceCircuitBreaker = Policy
            .Handle<RpcException>()
            .CircuitBreakerAsync(
                exceptionsAllowedBeforeBreaking: 3,
                durationOfBreak: TimeSpan.FromSeconds(30),
                onBreak: (ex, breakDelay) => _logger.LogWarning($"Compliance Circuit broken! No calls for {breakDelay.TotalSeconds}s. Exception: {ex.Message}"),
                onReset: () => _logger.LogInformation("Compliance Circuit reset!"),
                onHalfOpen: () => _logger.LogInformation("Compliance Circuit half-open; next call is a trial."));

        // Retry Policy with Exponential Backoff
        _retryPolicy = Policy
            .Handle<RpcException>()
            .WaitAndRetryAsync(
                retryCount: 3,
                sleepDurationProvider: retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)),
                onRetry: (exception, delay, retryCount, context) =>
                {
                    _logger.LogWarning($"Retry {retryCount} of {context.PolicyKey} due to: {exception.Message}. Waiting {delay.TotalSeconds}s before next retry.");
                });
    }

    public override async Task<JokeResponse> GetDarkJoke(JokeRequest request, ServerCallContext context)
    {
        try
        {
            // Service Dependency Map (Critical Paths)
            // 1. Content Corpus -> Personalization -> Compliance
            // 2. Content Corpus -> Compliance (if Personalization fails)
            // 3. Content Corpus (if both Personalization and Compliance fail)

            // Step 1: Fetch joke from Content Corpus
            var joke = await _retryPolicy.ExecuteAsync(async () =>
                await _contentCorpusCircuitBreaker.ExecuteAsync(async () =>
                {
                    var response = await _contentCorpusClient.GetDarkJokeAsync(new ContentCorpusRequest
                    {
                        UserId = request.UserId,
                        Category = "dark"
                    }, deadline: DateTime.UtcNow.AddSeconds(5));

                    if (response == null || string.IsNullOrEmpty(response.JokeText))
                        throw new RpcException(new Status(StatusCode.NotFound, "No jokes available in Content Corpus."));

                    return response.JokeText;
                }));

            // Step 2: Personalize joke (with fallback to default joke)
            string personalizedJoke;
            try
            {
                personalizedJoke = await _retryPolicy.ExecuteAsync(async () =>
                    await _personalizationCircuitBreaker.ExecuteAsync(async () =>
                    {
                        var response = await _personalizationEngineClient.PersonalizeJokeAsync(new PersonalizationRequest
                        {
                            UserId = request.UserId,
                            JokeText = joke
                        }, deadline: DateTime.UtcNow.AddSeconds(3));

                        return response?.PersonalizedJoke ?? joke;
                    }));
            }
            catch (Exception ex) when (ex is RpcException || ex is BrokenCircuitException)
            {
                _logger.LogWarning($"Personalization Engine failed. Serving default joke. Exception: {ex.Message}");
                personalizedJoke = joke; // Fallback to default joke
            }

            // Step 3: Compliance check (with fallback to least offensive tier)
            string compliantJoke;
            try
            {
                compliantJoke = await _retryPolicy.ExecuteAsync(async () =>
                    await _complianceCircuitBreaker.ExecuteAsync(async () =>
                    {
                        var response = await _complianceClient.CheckComplianceAsync(new ComplianceRequest
                        {
                            JokeText = personalizedJoke,
                            UserId = request.UserId,
                            OffensiveTier = request.OffensiveTier
                        }, deadline: DateTime.UtcNow.AddSeconds(3));

                        if (!response.IsCompliant)
                            throw new RpcException(new Status(StatusCode.FailedPrecondition, "Joke failed compliance check."));

                        return response.SanitizedJoke ?? personalizedJoke;
                    }));
            }
            catch (Exception ex) when (ex is RpcException || ex is BrokenCircuitException)
            {
                _logger.LogWarning($"Compliance check failed. Falling back to least offensive tier. Exception: {ex.Message}");
                compliantJoke = await GetLeastOffensiveJokeAsync(joke); // Fallback to least offensive joke
            }

            // Publish success event to Kafka
            await _kafkaProducer.ProduceAsync("joke-served", new JokeServedEvent
            {
                UserId = request.UserId,
                JokeText = compliantJoke,
                Timestamp = DateTime.UtcNow
            });

            return new JokeResponse
            {
                JokeText = compliantJoke,
                IsSuccess = true
            };
        }
        catch (Exception ex) when (ex is RpcException || ex is BrokenCircuitException)
        {
            _logger.LogError($"Failed to serve joke. Exception: {ex.Message}");

            // Publish failure event to Dead Letter Queue (DLQ)
            var failureEvent = new JokeFailureEvent
            {
                UserId = request.UserId,
                Request = JsonConvert.SerializeObject(request),
                Exception = ex.Message,
                Timestamp = DateTime.UtcNow
            };

            await _kafkaProducer.ProduceAsync("joke-failures-dlq", failureEvent);

            // Temporal.io workflow for retrying failed jokes
            await _temporalClient.StartWorkflowAsync("JokeRetryWorkflow", failureEvent);

            // Graceful degradation: return a default dark joke if all else fails
            return new JokeResponse
            {
                JokeText = "Why don't skeletons fight each other? They don't have the guts.",
                IsSuccess = false,
                ErrorMessage = "Service degradation: Could not fetch a personalized joke."
            };
        }
    }

    private async Task<string> GetLeastOffensiveJokeAsync(string originalJoke)
    {
        try
        {
            // Attempt to fetch a pre-approved least offensive joke from Content Corpus
            var response = await _contentCorpusClient.GetDarkJokeAsync(new ContentCorpusRequest
            {
                UserId = "default",
                Category = "dark-least-offensive"
            }, deadline: DateTime.UtcNow.AddSeconds(2));

            return response?.JokeText ?? originalJoke;
        }
        catch
        {
            return originalJoke; // Fallback to original joke if least offensive fetch fails
        }
    }
}

// gRPC Error Handling Patterns
public static class GrpcErrorHandler
{
    public static RpcException HandleGrpcError(StatusCode statusCode, string message, Exception innerException = null)
    {
        var status = new Status(statusCode, message);
        var metadata = new Metadata
        {
            { "timestamp", DateTime.UtcNow.ToString("o") }
        };

        return new RpcException(status, metadata, message);
    }
}

// Service Dependency Map (Critical Paths)
/*
1. Primary Path (Optimal):
   Content Corpus -> Personalization Engine -> Compliance Check -> User

2. Secondary Path (Personalization Degraded):
   Content Corpus -> Compliance Check -> User

3. Tertiary Path (Compliance Degraded):
   Content Corpus -> Personalization Engine -> User (least offensive tier)

4. Fallback Path (All Degraded):
   Content Corpus -> User (default joke)
*/

// Dead Letter Queue (DLQ) Design for Kafka
public class JokeFailureEvent
{
    public string UserId { get; set; }
    public string Request { get; set; }
    public string Exception { get; set; }
    public DateTime Timestamp { get; set; }
}

// Temporal.io Workflow for Retrying Failed Jokes
public class JokeRetryWorkflow : Workflow
{
    public async Task RunAsync(JokeFailureEvent failureEvent)
    {
        var retryOptions = new RetryOptions
        {
            MaximumAttempts = 3,
            InitialInterval = TimeSpan.FromSeconds(5),
            BackoffCoefficient = 2.0,
            MaximumInterval = TimeSpan.FromMinutes(1)
        };

        await Workflow.ExecuteActivityAsync(
            "RetryJokeActivity",
            failureEvent,
            retryOptions);
    }
}