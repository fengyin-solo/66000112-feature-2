from fastapi import APIRouter
from ..services.eeg_processor import generate_mock_eeg, compute_band_power, compute_spectrogram, compute_brain_state, compute_correlation, SAMPLE_RATE

router = APIRouter(prefix="/eeg", tags=["eeg"])

@router.get("/stream")
async def stream_eeg(duration: float = 5.0):
    return generate_mock_eeg(duration)

@router.get("/bands/{channel}")
async def band_power(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'bands': compute_band_power(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/brain-state/{channel}")
async def brain_state(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'state': compute_brain_state(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/spectrogram/{channel}")
async def spectrogram(channel: str):
    data = generate_mock_eeg(5.0)
    if channel in data['data']:
        return {'channel': channel, 'spectrogram': compute_spectrogram(data['data'][channel], SAMPLE_RATE)}
    return {'error': 'Channel not found'}

@router.get("/correlation/{channel}")
async def correlation(channel: str, duration: float = 3.0):
    data = generate_mock_eeg(duration)
    if channel not in data['data']:
        return {'error': 'Channel not found'}
    return compute_correlation(channel, data['data'], SAMPLE_RATE)

@router.get("/channels")
async def list_channels():
    from ..services.eeg_processor import CHANNELS
    return {'channels': CHANNELS}

@router.get("/sample/{channel}")
async def full_sample(channel: str, duration: float = 3.0, compare: str | None = None):
    data = generate_mock_eeg(duration)
    if channel not in data['data']:
        return {'error': 'Channel not found'}
    channel_data = data['data'][channel]
    # 对比通道与当前通道使用同一批波形数据计算，保证频段趋势与波形刷新帧一致
    compare_bands = None
    if compare:
        compare_data = data['data'].get(compare)
        if compare_data is not None:
            compare_bands = compute_band_power(compare_data, SAMPLE_RATE)
    return {
        'channel': channel,
        'compareChannel': compare if compare_bands is not None else None,
        'eeg': data,
        'bands': compute_band_power(channel_data, SAMPLE_RATE),
        'compareBands': compare_bands,
        'brainState': compute_brain_state(channel_data, SAMPLE_RATE),
        'correlation': compute_correlation(channel, data['data'], SAMPLE_RATE)
    }
