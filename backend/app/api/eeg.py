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
    if compare is not None and compare not in data['data']:
        return {'error': 'Compare channel not found'}
    channel_data = data['data'][channel]
    response = {
        'channel': channel,
        'eeg': data,
        'bands': compute_band_power(channel_data, SAMPLE_RATE),
        'brainState': compute_brain_state(channel_data, SAMPLE_RATE),
        'correlation': compute_correlation(channel, data['data'], SAMPLE_RATE),
    }
    # 对比通道与主通道取自同一段数据，保证时间对齐；compare 缺省时响应与旧版完全一致
    if compare is not None:
        response['compareChannel'] = compare
        response['compareBands'] = compute_band_power(data['data'][compare], SAMPLE_RATE)
    return response
