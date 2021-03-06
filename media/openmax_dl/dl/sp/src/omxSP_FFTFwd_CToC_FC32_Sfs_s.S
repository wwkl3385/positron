@//
@//  Copyright (c) 2013 The WebRTC project authors. All Rights Reserved.
@//
@//  Use of this source code is governed by a BSD-style license
@//  that can be found in the LICENSE file in the root of the source
@//  tree. An additional intellectual property rights grant can be found
@//  in the file PATENTS.  All contributing project authors may
@//  be found in the AUTHORS file in the root of the source tree.
@//
@//  This is a modification of omxSP_FFTFwd_CToC_SC32_Sfs_s.s
@//  to support float instead of SC32.
@//

@//
@// Description:
@// Compute an inverse FFT for a complex signal
@//
@//


@// Include standard headers

#include "dl/api/armCOMM_s.h"
#include "dl/api/omxtypes_s.h"

@// Import symbols required from other files
@// (For example tables)

        .extern  armSP_FFTFwd_CToC_FC32_Radix2_fs_OutOfPlace_unsafe
        .extern  armSP_FFTFwd_CToC_FC32_Radix4_fs_OutOfPlace_unsafe
        .extern  armSP_FFTFwd_CToC_FC32_Radix8_fs_OutOfPlace_unsafe
        .extern  armSP_FFTFwd_CToC_FC32_Radix4_OutOfPlace_unsafe
        .extern  armSP_FFTFwd_CToC_FC32_Radix2_OutOfPlace_unsafe

@// Set debugging level
@//DEBUG_ON    SETL {TRUE}



@// Guarding implementation by the processor name



    @// Guarding implementation by the processor name

@// Import symbols required from other files
@// (For example tables)
        .extern  armSP_FFTFwd_CToC_FC32_Radix2_ls_OutOfPlace_unsafe
        .extern  armSP_FFTFwd_CToC_FC32_Sfs_Radix2_ls_OutOfPlace_unsafe


@//Input Registers

#define pSrc            r0
#define pDst            r1
#define pFFTSpec        r2


@// Output registers
#define result          r0

@//Local Scratch Registers

#define argTwiddle      r1
#define argDst          r2
#define argScale        r4
#define tmpOrder        r4
#define pTwiddle        r4
#define pOut            r5
#define subFFTSize      r7
#define subFFTNum       r6
#define N               r6
#define order           r14
#define diff            r9
@// Total num of radix stages required to comple the FFT
#define count           r8
#define x0r             r4
#define x0i             r5
#define diffMinusOne    r2

@// Neon registers

#define dX0     D0.F32


    @// Allocate stack memory required by the function

    @// Write function header
        M_START     omxSP_FFTFwd_CToC_FC32_Sfs,r11,d15

@ Structure offsets for the FFTSpec
        .set    ARMsFFTSpec_N, 0
        .set    ARMsFFTSpec_pBitRev, 4
        .set    ARMsFFTSpec_pTwiddle, 8
        .set    ARMsFFTSpec_pBuf, 12

        @// Define stack arguments

        @// Read the size from structure and take log
        LDR     N, [pFFTSpec, #ARMsFFTSpec_N]

        @// Read other structure parameters
        LDR     pTwiddle, [pFFTSpec, #ARMsFFTSpec_pTwiddle]
        LDR     pOut, [pFFTSpec, #ARMsFFTSpec_pBuf]

        CLZ     order,N                             @// N = 2^order
        RSB     order,order,#31
        MOV     subFFTSize,#1
        @//MOV     subFFTNum,N

        CMP     order,#3
        BGT     orderGreaterthan3                   @// order > 3

        CMP     order,#1
        BGE     orderGreaterthan0                   @// order > 0
        VLD1    dX0,[pSrc]
        VST1    dX0,[pDst]
        MOV     pSrc,pDst
        BLT     FFTEnd

orderGreaterthan0:
        @// set the buffers appropriately for various orders
        CMP     order,#2
        MOVNE   argDst,pDst
        MOVEQ   argDst,pOut
        @// Pass the first stage destination in RN5
        MOVEQ   pOut,pDst
        MOV     argTwiddle,pTwiddle

        CMP     order,#1
        BGT     orderGreaterthan1
        @// order = 1
        BL    armSP_FFTFwd_CToC_FC32_Radix2_fs_OutOfPlace_unsafe
        B       FFTEnd

orderGreaterthan1:
        CMP     order,#2
        BGT     orderGreaterthan2
        @// order = 2
        BL    armSP_FFTFwd_CToC_FC32_Radix2_fs_OutOfPlace_unsafe
        BL    armSP_FFTFwd_CToC_FC32_Radix2_ls_OutOfPlace_unsafe
        B       FFTEnd

orderGreaterthan2:                                                                     @// order =3
        BL    armSP_FFTFwd_CToC_FC32_Radix2_fs_OutOfPlace_unsafe
        BL    armSP_FFTFwd_CToC_FC32_Radix2_OutOfPlace_unsafe
        BL    armSP_FFTFwd_CToC_FC32_Radix2_ls_OutOfPlace_unsafe
        B       FFTEnd

orderGreaterthan3:
        @// Set input args to fft stages
        TST     order, #2
        MOVNE   argDst,pDst
        MOVEQ   argDst,pOut
        @// Pass the first stage destination in RN5
        MOVEQ   pOut,pDst
        MOV     argTwiddle,pTwiddle

        @//check for even or odd order
        @// NOTE: The following combination of BL's would work fine even though
        @// the first BL would corrupt the flags. This is because the end of
        @// the "grpZeroSetLoop" loop inside
        @// armSP_FFTFwd_CToC_FC32_Radix4_fs_OutOfPlace_unsafe sets the Z flag
        @// to EQ

        TST     order,#0x00000001
        BLEQ    armSP_FFTFwd_CToC_FC32_Radix4_fs_OutOfPlace_unsafe
        BLNE    armSP_FFTFwd_CToC_FC32_Radix8_fs_OutOfPlace_unsafe

        CMP        subFFTNum,#4
        BLT     FFTEnd


unscaledRadix4Loop:
        BEQ        lastStageUnscaledRadix4
         BL        armSP_FFTFwd_CToC_FC32_Radix4_OutOfPlace_unsafe
         CMP        subFFTNum,#4
         B        unscaledRadix4Loop

lastStageUnscaledRadix4:
        BL      armSP_FFTFwd_CToC_FC32_Radix4_ls_OutOfPlace_unsafe
        B        FFTEnd

FFTEnd:

        @// Set return value
        MOV     result, #OMX_Sts_NoErr

        @// Write function tail
        M_END

        .end
